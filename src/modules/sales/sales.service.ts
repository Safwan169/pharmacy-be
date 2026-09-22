import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { PaginatedDto, paginate } from '../../common/dto/paginated.dto';
import { adjustCustomerBalance } from '../customers/customer-balance';
import { Customer } from '../customers/entities/customer.entity';
import { ProductVariant } from '../product-variants/entities/product-variant.entity';
import { VariantUnit } from '../product-variants/entities/variant-unit.entity';
import { PendingPriceService } from '../pricing/pending-price.service';
import { BatchAllocation, StockService } from '../stock/stock.service';
import { computeCheckoutTotals, formatInvoiceNumber } from './checkout-totals';
import { CheckoutItemFailureDto } from './dto/checkout-failure.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { ListSalesQueryDto } from './dto/list-sales-query.dto';
import { SaleItem } from './entities/sale-item.entity';
import { Sale } from './entities/sale.entity';

import { fromMinorUnits, toMinorUnits } from '../../common/money';

function normalisePhone(phone: string | undefined | null): string | null {
  const digits = (phone ?? '').replace(/[^\d+]/g, '');
  return digits === '' ? null : digits;
}
const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface InvoiceSequenceRow {
  day_key: string;
  last_value: number | string;
}

@Injectable()
export class SalesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Sale) private readonly salesRepository: Repository<Sale>,
    private readonly stockService: StockService,
    private readonly pendingPrices: PendingPriceService,
  ) {}

  /**
   * Direct POS checkout. All or nothing: if any line is unsellable, nothing is
   * written and no stock moves. Stock is deducted with a conditional UPDATE so
   * two simultaneous checkouts can never oversell the same variant.
   */
  async checkout(dto: CheckoutDto, userId: number): Promise<Sale> {
    const duplicates = findDuplicateVariants(dto.items);
    if (duplicates.length > 0) {
      throw rejectCheckout(duplicates);
    }
    if (dto.payment_method === 'due' && dto.customer_id === undefined && dto.customer === undefined) {
      throw new BadRequestException({
        message: 'A due sale needs a customer: send customer_id or customer { name, phone }.',
        reason: 'customer_required',
      });
    }

    const saleId = await this.dataSource.transaction(async (manager) => {
      const variants = await manager.find(ProductVariant, {
        where: { id: In(dto.items.map((item) => item.variant_id)) },
        relations: { product: true, units: true },
      });
      const variantsById = new Map(variants.map((v) => [v.id, v]));
      // Resolved per line: the unit sold and how many base units that moves.
      const lineUnits = new Map<number, VariantUnit>();
      // Which batches each line draws from, soonest expiry first.
      const lineBatches = new Map<number, BatchAllocation[]>();

      const failures: CheckoutItemFailureDto[] = [];
      for (const item of dto.items) {
        const variant = variantsById.get(item.variant_id);
        if (variant === undefined) {
          failures.push({
            variant_id: item.variant_id,
            reason: 'not_found',
            message: 'No product variant with this id.',
            requested_quantity: item.quantity,
          });
          continue;
        }
        // Checked before price and stock: a withdrawn SKU isn't sellable at any
        // price, so "no price set" would be misleading advice here.
        if (!variant.isActive) {
          failures.push({
            variant_id: item.variant_id,
            reason: 'inactive',
            message:
              'This item has been withdrawn from the catalogue and cannot be sold.',
            requested_quantity: item.quantity,
          });
          continue;
        }
        const unit = variant.units.find((u) => u.id === item.unit_id);
        if (unit === undefined) {
          failures.push({
            variant_id: item.variant_id,
            unit_id: item.unit_id,
            reason: 'unit_not_found',
            message: 'This item is not sold in that unit any more.',
            requested_quantity: item.quantity,
          });
          continue;
        }
        if (!unit.isSellable) {
          failures.push({
            variant_id: item.variant_id,
            unit_id: item.unit_id,
            reason: 'unit_not_sellable',
            message: `This item is not sold by the ${unit.name}.`,
            requested_quantity: item.quantity,
          });
          continue;
        }
        if (unit.price === null) {
          failures.push({
            variant_id: item.variant_id,
            unit_id: item.unit_id,
            reason: 'not_priced',
            message: `This item has no ${unit.name} price set yet and cannot be sold.`,
            requested_quantity: item.quantity,
          });
          continue;
        }
        lineUnits.set(item.variant_id, unit);
        // Stock is what the unexpired batches hold, not the raw total.
        const allocation = await this.stockService.allocate(
          manager,
          variant.id,
          item.quantity * unit.qtyInBase,
        );
        if (!allocation.ok) {
          const available = Math.floor(allocation.available / unit.qtyInBase);
          failures.push({
            variant_id: item.variant_id,
            unit_id: item.unit_id,
            reason:
              allocation.reason === 'expired_only'
                ? 'expired_only'
                : 'insufficient_stock',
            message:
              allocation.reason === 'expired_only'
                ? 'The only stock left has expired and cannot be sold.'
                : `Only ${available} ${unit.name} in stock, ${item.quantity} requested.`,
            requested_quantity: item.quantity,
            available_quantity: available,
          });
          continue;
        }
        lineBatches.set(item.variant_id, allocation.allocations);
      }
      if (failures.length > 0) {
        throw rejectCheckout(failures);
      }

      const totals = computeCheckoutTotals(
        dto.items.map((item) => ({
          // Non-null: the price check above already rejected unpriced units.
          unitPrice: lineUnits.get(item.variant_id)!.price!,
          quantity: item.quantity,
        })),
        dto.discount,
      );

      // How the money is settled. Cash may record what was handed over so the
      // receipt can show the change; due books the whole total to the customer.
      const totalMinor = toMinorUnits(totals.totalAmount);
      let amountTendered: number | null = null;
      let changeGiven: number | null = null;
      let customerId: number | null = null;
      let paidMinor = totalMinor;
      let dueMinor = 0;

      if (dto.payment_method === 'cash' && dto.amount_tendered !== undefined) {
        const tenderedMinor = toMinorUnits(dto.amount_tendered);
        if (tenderedMinor < totalMinor) {
          throw new BadRequestException({
            message: 'The cash handed over is less than the total.',
            reason: 'tendered_short',
          });
        }
        amountTendered = fromMinorUnits(tenderedMinor);
        changeGiven = fromMinorUnits(tenderedMinor - totalMinor);
      }
      if (dto.payment_method === 'due') {
        customerId = await this.resolveCustomer(manager, dto.customer_id, dto.customer);
        paidMinor = 0;
        dueMinor = totalMinor;
      }

      // The sale row first, so stock movements can reference its id.
      const sale = await manager.save(
        manager.create(Sale, {
          invoiceNumber: await this.nextInvoiceNumber(manager),
          subtotal: totals.subtotal,
          discountType: dto.discount?.type ?? null,
          discountValue: dto.discount?.value ?? null,
          discountAmount: totals.discountAmount,
          totalAmount: totals.totalAmount,
          paymentMethod: dto.payment_method,
          customerId,
          amountTendered,
          changeGiven,
          bkashTrxId:
            dto.payment_method === 'bkash' ? dto.bkash_trx_id?.trim() || null : null,
          paidAmount: fromMinorUnits(paidMinor),
          dueAmount: fromMinorUnits(dueMinor),
          createdById: userId,
        }),
      );
      if (customerId !== null && dueMinor > 0) {
        await adjustCustomerBalance(manager, customerId, dueMinor);
      }

      // Deduct in a stable id order so two concurrent checkouts touching the
      // same variants take row locks in the same sequence and can't deadlock.
      const ordered = [...dto.items]
        .map((item, index) => ({ item, index }))
        .sort((a, b) => a.item.variant_id - b.item.variant_id);
      const items: SaleItem[] = [];
      for (const { item, index } of ordered) {
        const variant = variantsById.get(item.variant_id)!;
        const unit = lineUnits.get(item.variant_id)!;
        const allocations = lineBatches.get(item.variant_id)!;

        for (const allocation of allocations) {
          // Zero rows means someone else bought it, it was withdrawn, or it
          // expired between the check above and now. Roll the whole thing
          // back rather than partially selling.
          const ok = await this.stockService.deductAllocation(
            manager,
            allocation,
            { type: 'sale', id: sale.id },
            userId,
          );
          if (!ok) {
            throw rejectCheckout([
              {
                variant_id: item.variant_id,
                unit_id: item.unit_id,
                reason: 'stock_changed',
                message:
                  'This item changed while checking out. Nothing was sold — please retry.',
                requested_quantity: item.quantity,
              },
            ]);
          }
        }

        // One line per basket item. When a line straddles batches, batch_id
        // is the one it mostly came from; the per-batch split is in
        // stock_movements under this sale's id.
        const primary = [...allocations].sort(
          (a, b) => b.quantity - a.quantity,
        )[0];
        items.push(
          manager.create(SaleItem, {
            saleId: sale.id,
            productVariantId: variant.id,
            batchId: primary.batch.id,
            // Snapshots: a later catalogue edit must not rewrite this invoice.
            brandNameSnapshot: variant.product.brandName,
            dosageFormSnapshot: variant.dosageForm,
            strengthSnapshot: variant.strength,
            unitNameSnapshot: unit.name,
            qtyInBase: unit.qtyInBase,
            baseQtyDeducted: item.quantity * unit.qtyInBase,
            unitPrice: unit.price!,
            quantity: item.quantity,
            lineTotal: totals.lineTotals[index],
          }),
        );
      }
      await manager.save(items);
      // A parked price change goes live the moment the old batches are gone.
      for (const { item } of ordered) {
        await this.pendingPrices.activateIfDue(manager, item.variant_id, userId);
      }
      return sale.id;
    });

    return this.findOne(saleId);
  }

  async findAll(
    query: ListSalesQueryDto,
    onlyCashierId?: number,
  ): Promise<PaginatedDto<Sale>> {
    const qb = this.baseQuery();
    if (onlyCashierId !== undefined) {
      qb.andWhere('sale.createdById = :cashierId', { cashierId: onlyCashierId });
    }

    if (query.search !== undefined) {
      qb.andWhere('sale.invoiceNumber ILIKE :search', {
        search: `%${query.search}%`,
      });
    }
    if (query.status !== undefined && query.status !== 'all') {
      qb.andWhere('sale.status = :status', { status: query.status });
    }
    if (query.from !== undefined) {
      qb.andWhere('sale.createdAt >= :from', { from: new Date(query.from) });
    }
    if (query.to !== undefined) {
      // A bare `2026-08-17` means the whole day, so compare against the start
      // of the next day rather than midnight, which would exclude everything.
      if (BARE_DATE.test(query.to)) {
        const dayAfter = new Date(`${query.to}T00:00:00.000Z`);
        dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
        qb.andWhere('sale.createdAt < :to', { to: dayAfter });
      } else {
        qb.andWhere('sale.createdAt <= :to', { to: new Date(query.to) });
      }
    }

    qb.orderBy('sale.createdAt', 'DESC')
      .addOrderBy('sale.id', 'DESC')
      .skip(query.skip)
      .take(query.limit);

    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: number): Promise<Sale> {
    const sale = await this.baseQuery()
      .leftJoinAndSelect('sale.items', 'item')
      .leftJoinAndSelect('sale.returns', 'ret')
      .leftJoinAndSelect('ret.items', 'retItem')
      .leftJoin('sale.voidedBy', 'voider')
      .addSelect(['voider.id', 'voider.email'])
      .where('sale.id = :id', { id })
      .orderBy('item.id', 'ASC')
      .addOrderBy('ret.id', 'ASC')
      .getOne();

    if (!sale) {
      throw new NotFoundException(`Sale ${id} not found`);
    }
    return sale;
  }

  /** An existing customer by id, or a new one from name + phone (reusing a phone match). */
  private async resolveCustomer(
    manager: EntityManager,
    customerId: number | undefined,
    inline: { name: string; phone?: string } | undefined,
  ): Promise<number> {
    if (customerId !== undefined) {
      const found = await manager.findOne(Customer, { where: { id: customerId } });
      if (!found || !found.isActive) {
        throw new BadRequestException({
          message: 'That customer does not exist.',
          reason: 'customer_not_found',
        });
      }
      return found.id;
    }
    const phone = normalisePhone(inline!.phone);
    if (phone) {
      const existing = await manager.findOne(Customer, { where: { phone } });
      if (existing) return existing.id;
    }
    const created = await manager.save(
      manager.create(Customer, {
        name: inline!.name.trim(),
        phone,
        address: null,
        dueBalance: 0,
      }),
    );
    return created.id;
  }

  /**
   * Atomic per-day counter. The `ON CONFLICT DO UPDATE` takes a row lock, so
   * concurrent checkouts serialise here and each gets a distinct sequence.
   */
  private async nextInvoiceNumber(manager: EntityManager): Promise<string> {
    // Typed binding rather than an `as` cast: query() returns `any`, and an
    // assertion would be stripped as "unnecessary", losing the types silently.
    // An INSERT ... RETURNING resolves to the rows array (an UPDATE would
    // instead resolve to a [rows, rowCount] tuple).
    const rows: InvoiceSequenceRow[] = await manager.query(
      `INSERT INTO invoice_sequences ("day", "last_value")
       VALUES (CURRENT_DATE, 1)
       ON CONFLICT ("day") DO UPDATE
         SET "last_value" = invoice_sequences."last_value" + 1
       RETURNING to_char("day", 'YYYYMMDD') AS day_key, "last_value"`,
    );

    const row = rows[0];
    // `last_value` arrives as a string on some pg type configurations.
    return formatInvoiceNumber(row.day_key, Number(row.last_value));
  }

  /** Joins the processing admin without ever selecting their password hash. */
  private baseQuery() {
    return this.salesRepository
      .createQueryBuilder('sale')
      .leftJoin('sale.createdBy', 'cashier')
      .addSelect(['cashier.id', 'cashier.email', 'cashier.name', 'cashier.role'])
      .leftJoinAndSelect('sale.customer', 'customer');
  }
}

function findDuplicateVariants(
  items: { variant_id: number; quantity: number }[],
): CheckoutItemFailureDto[] {
  const seen = new Set<number>();
  const duplicated = new Set<number>();
  for (const item of items) {
    if (seen.has(item.variant_id)) {
      duplicated.add(item.variant_id);
    }
    seen.add(item.variant_id);
  }

  return [...duplicated].map((variantId) => ({
    variant_id: variantId,
    reason: 'duplicate_item' as const,
    message:
      'This variant appears more than once. Combine it into a single line with the total quantity.',
  }));
}

function rejectCheckout(
  errors: CheckoutItemFailureDto[],
): UnprocessableEntityException {
  return new UnprocessableEntityException({
    message:
      'Checkout rejected: no stock was deducted and no sale was recorded.',
    errors,
  });
}
