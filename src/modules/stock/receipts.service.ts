import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { nextDocumentNumber } from '../../common/document-number';
import { PaginatedDto, paginate } from '../../common/dto/paginated.dto';
import { fromMinorUnits, toMinorUnits } from '../../common/money';
import { AuditService } from '../audit/audit.service';
import { PendingPriceService } from '../pricing/pending-price.service';
import { ProductVariant } from '../product-variants/entities/product-variant.entity';
import {
  CreateReceiptDto,
  ListMovementsQueryDto,
  ListReceiptsQueryDto,
  ReceiptLineFailureDto,
} from './dto/receipt.dto';
import { StockMovement } from './entities/stock-movement.entity';
import { StockReceipt, StockReceiptItem } from './entities/stock-receipt.entity';
import { StockService } from './stock.service';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { SupplierPayment } from '../suppliers/entities/supplier-payment.entity';

const DOCUMENT_PREFIX = 'GRN';
const PAYMENT_PREFIX = 'SPY';

/** Today as YYYY-MM-DD in the pharmacy's zone, for the "not in the past" check. */
function todayInDhaka(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Goods received. Every line creates a batch through StockService, so the
 * variant total, the batch and the ledger all move in one transaction —
 * a rejected line means nothing was received.
 */
@Injectable()
export class ReceiptsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(StockReceipt)
    private readonly receiptsRepository: Repository<StockReceipt>,
    @InjectRepository(StockMovement)
    private readonly movementsRepository: Repository<StockMovement>,
    private readonly stockService: StockService,
    private readonly pendingPrices: PendingPriceService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateReceiptDto, userId: number): Promise<StockReceipt> {
    const today = todayInDhaka();

    const id = await this.dataSource.transaction(async (manager) => {
      const variants = await manager.find(ProductVariant, {
        where: { id: In([...new Set(dto.items.map((i) => i.variant_id))]) },
        relations: { units: true, product: true },
      });
      const byId = new Map(variants.map((v) => [v.id, v]));

      const failures: ReceiptLineFailureDto[] = [];
      const resolved = dto.items.map((line, index) => {
        const variant = byId.get(line.variant_id);
        if (!variant) {
          failures.push({
            index,
            variant_id: line.variant_id,
            reason: 'not_found',
            message: 'No medicine with this id.',
          });
          return null;
        }
        if (!variant.isActive) {
          failures.push({
            index,
            variant_id: line.variant_id,
            reason: 'inactive',
            message: 'This medicine is withdrawn from the catalogue. Restore it before receiving stock.',
          });
          return null;
        }
        let unitName = variant.baseUnit;
        let qtyInBase = 1;
        if (line.unit_id !== undefined) {
          const unit = variant.units.find((u) => u.id === line.unit_id);
          if (!unit) {
            failures.push({
              index,
              variant_id: line.variant_id,
              reason: 'unit_not_found',
              message: 'That unit does not belong to this medicine.',
            });
            return null;
          }
          unitName = unit.name;
          qtyInBase = unit.qtyInBase;
        }
        if (line.expiry_date !== undefined && line.expiry_date < today) {
          failures.push({
            index,
            variant_id: line.variant_id,
            reason: 'expired_batch',
            message: 'The expiry date is already in the past. Expired stock cannot be received.',
          });
          return null;
        }
        return { line, variant, unitName, qtyInBase };
      });

      if (failures.length > 0) {
        throw new UnprocessableEntityException({
          message: 'Receipt rejected: no stock was added.',
          errors: failures,
        });
      }

      let totalMinor = 0;
      const receipt = await manager.save(
        manager.create(StockReceipt, {
          receiptNumber: await nextDocumentNumber(manager, DOCUMENT_PREFIX),
          supplierId: dto.supplier_id ?? null,
          supplierInvoiceNo: dto.supplier_invoice_no?.trim() || null,
          receivedAt: dto.received_at ?? today,
          totalCost: 0,
          note: dto.note?.trim() || null,
          createdById: userId,
        }),
      );

      for (const entry of resolved) {
        const { line, variant, unitName, qtyInBase } = entry!;
        const baseQuantity = line.quantity * qtyInBase;
        const lineCostMinor = toMinorUnits(line.unit_cost) * line.quantity;
        totalMinor += lineCostMinor;
        // Cost per base unit, to the poisha — what profit reports multiply by.
        const costPerBase = fromMinorUnits(
          Math.round(toMinorUnits(line.unit_cost) / qtyInBase),
        );

        const batch = await this.stockService.createBatch(manager, {
          variantId: variant.id,
          batchNo: line.batch_no?.trim() || null,
          expiryDate: line.expiry_date ?? null,
          costPrice: costPerBase,
          quantity: baseQuantity,
          userId,
          type: 'stock_in',
          referenceType: 'receipt',
          referenceId: receipt.id,
          note: receipt.receiptNumber,
        });

        await manager.save(
          manager.create(StockReceiptItem, {
            receiptId: receipt.id,
            variantId: variant.id,
            batchId: batch.id,
            batchNo: batch.batchNo,
            expiryDate: batch.expiryDate,
            unitName,
            qtyInBase,
            quantity: line.quantity,
            baseQuantity,
            unitCost: line.unit_cost,
            lineCost: fromMinorUnits(lineCostMinor),
          }),
        );

        // The company revised the printed price: record it on the medicine so
        // later deliveries are measured against the new MRP.
        if (line.new_mrp !== undefined && line.new_mrp !== variant.mrp) {
          await manager.update(ProductVariant, { id: variant.id }, { mrp: line.new_mrp });
          await this.auditService.record(
            {
              userId,
              action: 'mrp.update',
              entityType: 'variant',
              entityId: variant.id,
              summary: `${variant.product?.brandName ?? `#${variant.id}`}${variant.strength ? ` ${variant.strength}` : ''}: printed MRP ${variant.mrp?.toFixed(2) ?? '—'} → ${line.new_mrp.toFixed(2)} (delivery ${receipt.receiptNumber})`,
            },
            manager,
          );
        }

        // Selling price set at the door: now, or once the older packs are gone.
        if (line.sell_prices && line.sell_prices.length > 0) {
          if (line.price_when === 'after_old_stock') {
            await this.pendingPrices.schedule(manager, variant.id, batch.id, line.sell_prices, userId);
          } else {
            await this.pendingPrices.applyNow(
              manager,
              variant.id,
              line.sell_prices,
              userId,
              `set at delivery ${receipt.receiptNumber}`,
            );
          }
        }
      }

      // Payment at the door. Nothing sent = paid in full (a cash purchase);
      // less than the total goes on the supplier's account, which therefore
      // needs a supplier to put it on.
      const paidMinor =
        dto.paid_amount === undefined ? totalMinor : toMinorUnits(dto.paid_amount);
      if (paidMinor > totalMinor) {
        throw new BadRequestException({
          message: `Paid amount exceeds the delivery total of ${fromMinorUnits(totalMinor).toFixed(2)}.`,
          reason: 'overpayment',
        });
      }
      const dueMinor = totalMinor - paidMinor;
      if (dueMinor > 0 && dto.supplier_id === undefined) {
        throw new BadRequestException({
          message: 'Pick a supplier to put the unpaid amount on their account.',
          reason: 'supplier_required',
        });
      }

      await manager.update(
        StockReceipt,
        { id: receipt.id },
        { totalCost: fromMinorUnits(totalMinor), paidAmount: fromMinorUnits(paidMinor) },
      );

      let balanceAfter = 0;
      if (dto.supplier_id !== undefined) {
        const supplier = await manager.findOne(Supplier, {
          where: { id: dto.supplier_id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!supplier) throw new NotFoundException(`Supplier ${dto.supplier_id} not found`);
        balanceAfter = fromMinorUnits(toMinorUnits(supplier.dueBalance) + dueMinor);
        await manager.update(Supplier, { id: supplier.id }, { dueBalance: balanceAfter });
      }
      if (paidMinor > 0) {
        await manager.save(
          manager.create(SupplierPayment, {
            supplierId: dto.supplier_id ?? null,
            receiptId: receipt.id,
            paymentNumber: await nextDocumentNumber(manager, PAYMENT_PREFIX),
            amount: fromMinorUnits(paidMinor),
            method: dto.paid_method ?? 'cash',
            fromDrawer: dto.paid_from_drawer ?? true,
            reference: null,
            note: receipt.receiptNumber,
            balanceAfter,
            createdById: userId,
          }),
        );
      }
      return receipt.id;
    });

    return this.findOne(id);
  }

  async findAll(query: ListReceiptsQueryDto): Promise<PaginatedDto<StockReceipt>> {
    const qb = this.receiptsRepository
      .createQueryBuilder('receipt')
      .leftJoinAndSelect('receipt.supplier', 'supplier')
      .leftJoin('receipt.createdBy', 'user')
      .addSelect(['user.id', 'user.email']);
    if (query.search !== undefined) {
      qb.andWhere(
        '(receipt.receiptNumber ILIKE :search OR receipt.supplierInvoiceNo ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.supplier_id !== undefined) {
      qb.andWhere('receipt.supplierId = :supplierId', { supplierId: query.supplier_id });
    }
    if (query.from !== undefined) {
      qb.andWhere('receipt.receivedAt >= :from', { from: query.from });
    }
    if (query.to !== undefined) {
      qb.andWhere('receipt.receivedAt <= :to', { to: query.to });
    }
    qb.orderBy('receipt.receivedAt', 'DESC')
      .addOrderBy('receipt.id', 'DESC')
      .skip(query.skip)
      .take(query.limit);
    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: number): Promise<StockReceipt> {
    const receipt = await this.receiptsRepository
      .createQueryBuilder('receipt')
      .leftJoinAndSelect('receipt.supplier', 'supplier')
      .leftJoin('receipt.createdBy', 'user')
      .addSelect(['user.id', 'user.email'])
      .leftJoinAndSelect('receipt.items', 'item')
      .leftJoinAndSelect('item.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .where('receipt.id = :id', { id })
      .orderBy('item.id', 'ASC')
      .getOne();
    if (!receipt) {
      throw new NotFoundException(`Receipt ${id} not found`);
    }
    return receipt;
  }

  async movements(query: ListMovementsQueryDto): Promise<PaginatedDto<StockMovement>> {
    const qb = this.movementsRepository
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.variant', 'variant')
      .innerJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('m.batch', 'batch')
      .leftJoin('m.createdBy', 'user')
      .addSelect(['user.id', 'user.email']);
    if (query.variant_id !== undefined) {
      qb.andWhere('m.variantId = :variantId', { variantId: query.variant_id });
    }
    if (query.type !== undefined) {
      qb.andWhere('m.type = :type', { type: query.type });
    }
    if (query.from !== undefined) {
      qb.andWhere("m.createdAt >= (:from::date AT TIME ZONE 'Asia/Dhaka')", {
        from: query.from,
      });
    }
    if (query.to !== undefined) {
      qb.andWhere("m.createdAt < ((:to::date + 1) AT TIME ZONE 'Asia/Dhaka')", {
        to: query.to,
      });
    }
    qb.orderBy('m.createdAt', 'DESC')
      .addOrderBy('m.id', 'DESC')
      .skip(query.skip)
      .take(query.limit);
    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }
}
