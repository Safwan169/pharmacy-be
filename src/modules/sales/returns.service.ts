import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { nextDocumentNumber } from '../../common/document-number';
import { fromMinorUnits, toMinorUnits } from '../../common/money';
import { adjustCustomerBalance } from '../customers/customer-balance';
import { civilDateIn, PHARMACY_TIME_ZONE } from '../dashboard/date-range';
import { StockBatch } from '../stock/entities/stock-batch.entity';
import { StockMovement } from '../stock/entities/stock-movement.entity';
import { StockService } from '../stock/stock.service';
import {
  CreateReturnDto,
  ReturnLineFailureDto,
  VoidSaleDto,
} from './dto/return.dto';
import { SaleItem } from './entities/sale-item.entity';
import { SaleReturn, SaleReturnItem } from './entities/sale-return.entity';
import { Sale } from './entities/sale.entity';

const RETURN_PREFIX = 'RET';

/**
 * Undoing sales. A void reverses everything the same day; a return takes
 * some units back later. Both restock through StockService so the ledger
 * shows exactly which batch the goods went back into.
 */
@Injectable()
export class ReturnsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stockService: StockService,
  ) {}

  /**
   * Cancels a sale made today. Every deducted batch gets its units back, the
   * sale keeps its invoice number and is marked voided. Refused once the day
   * has rolled over or anything has already been returned — use a return then.
   */
  async voidSale(saleId: number, dto: VoidSaleDto, userId: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const sale = await manager.findOne(Sale, {
        where: { id: saleId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sale) throw new NotFoundException(`Sale ${saleId} not found`);
      if (sale.status !== 'completed') {
        throw new ConflictException({
          message: 'This sale has already been voided or had items returned.',
          reason: 'not_voidable',
        });
      }
      const today = civilDateIn(new Date(), PHARMACY_TIME_ZONE);
      if (civilDateIn(sale.createdAt, PHARMACY_TIME_ZONE) !== today) {
        throw new ConflictException({
          message: 'Only a sale made today can be voided. Use a return instead.',
          reason: 'void_window_closed',
        });
      }

      // The per-batch split of what checkout deducted.
      const deductions = await manager.find(StockMovement, {
        where: { referenceType: 'sale', referenceId: saleId, type: 'sale' },
        order: { id: 'ASC' },
      });
      for (const movement of deductions) {
        await this.restock(manager, {
          variantId: movement.variantId,
          batchId: movement.batchId,
          quantity: -movement.quantity,
          saleId,
          userId,
          note: `Void ${sale.invoiceNumber}`,
        });
      }

      // A voided due sale no longer counts against the customer.
      if (sale.customerId !== null && sale.dueAmount > 0) {
        await adjustCustomerBalance(manager, sale.customerId, -toMinorUnits(sale.dueAmount));
      }
      await manager.update(
        Sale,
        { id: saleId },
        {
          status: 'voided',
          voidedAt: new Date(),
          voidedById: userId,
          voidReason: dto.reason.trim(),
          dueAmount: 0,
        },
      );
    });
  }

  /**
   * Takes units back from specific lines. Refund per unit is the unit price
   * less that line's share of the sale's discount, so a discounted sale
   * doesn't refund more than was paid.
   */
  async createReturn(
    saleId: number,
    dto: CreateReturnDto,
    userId: number,
  ): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const sale = await manager.findOne(Sale, {
        where: { id: saleId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sale) throw new NotFoundException(`Sale ${saleId} not found`);
      if (sale.status === 'voided' || sale.status === 'returned') {
        throw new ConflictException({
          message:
            sale.status === 'voided'
              ? 'This sale was voided; there is nothing to return.'
              : 'Everything on this sale has already been returned.',
          reason: 'not_returnable',
        });
      }

      const items = await manager.find(SaleItem, { where: { saleId } });
      const byId = new Map(items.map((i) => [i.id, i]));
      const failures: ReturnLineFailureDto[] = [];
      const seen = new Set<number>();

      for (const line of dto.items) {
        if (seen.has(line.sale_item_id)) {
          failures.push({
            sale_item_id: line.sale_item_id,
            reason: 'duplicate_item',
            message: 'This line appears twice. Combine it into one.',
          });
          continue;
        }
        seen.add(line.sale_item_id);
        const item = byId.get(line.sale_item_id);
        if (!item) {
          failures.push({
            sale_item_id: line.sale_item_id,
            reason: 'sale_item_not_found',
            message: 'That line is not part of this sale.',
          });
          continue;
        }
        const returnable = item.quantity - item.returnedQuantity;
        if (line.quantity > returnable) {
          failures.push({
            sale_item_id: line.sale_item_id,
            reason: 'too_many',
            message: `Only ${returnable} ${item.unitNameSnapshot} can still be returned on this line.`,
            returnable_quantity: returnable,
          });
        }
      }
      if (failures.length > 0) {
        throw new UnprocessableEntityException({
          message: 'Return rejected: nothing was refunded or restocked.',
          errors: failures,
        });
      }

      const subtotalMinor = toMinorUnits(sale.subtotal);
      const discountMinor = toMinorUnits(sale.discountAmount);

      const saleReturn = await manager.save(
        manager.create(SaleReturn, {
          saleId,
          returnNumber: await nextDocumentNumber(manager, RETURN_PREFIX),
          refundAmount: 0,
          refundMethod: dto.refund_method,
          reason: dto.reason?.trim() || null,
          createdById: userId,
        }),
      );

      let refundTotalMinor = 0;
      for (const line of dto.items) {
        const item = byId.get(line.sale_item_id)!;
        const lineMinor = toMinorUnits(item.lineTotal);
        // This line's slice of the discount, then per unit, then × returned.
        const lineDiscountMinor =
          subtotalMinor === 0
            ? 0
            : Math.round((discountMinor * lineMinor) / subtotalMinor);
        const paidForLineMinor = lineMinor - lineDiscountMinor;
        const refundMinor = Math.round(
          (paidForLineMinor * line.quantity) / item.quantity,
        );
        refundTotalMinor += refundMinor;

        const baseQuantity = line.quantity * item.qtyInBase;
        const restock = line.restock ?? true;
        if (restock) {
          await this.restock(manager, {
            variantId: item.productVariantId,
            batchId: item.batchId,
            quantity: baseQuantity,
            saleId,
            userId,
            note: `Return ${saleReturn.returnNumber}`,
          });
        }

        await manager.save(
          manager.create(SaleReturnItem, {
            returnId: saleReturn.id,
            saleItemId: item.id,
            quantity: line.quantity,
            baseQuantity,
            refundAmount: fromMinorUnits(refundMinor),
            restock,
          }),
        );
        await manager.increment(
          SaleItem,
          { id: item.id },
          'returnedQuantity',
          line.quantity,
        );
      }

      await manager.update(
        SaleReturn,
        { id: saleReturn.id },
        { refundAmount: fromMinorUnits(refundTotalMinor) },
      );
      if (dto.refund_method === 'due_adjust') {
        if (sale.customerId === null) {
          throw new ConflictException({
            message: 'This sale has no customer, so there is no due balance to reduce. Refund in cash or bKash.',
            reason: 'no_customer',
          });
        }
        // Take the refund off what they still owe on this sale first, then the balance.
        const offSale = Math.min(refundTotalMinor, toMinorUnits(sale.dueAmount));
        await manager.update(
          Sale,
          { id: saleId },
          { dueAmount: fromMinorUnits(toMinorUnits(sale.dueAmount) - offSale) },
        );
        await adjustCustomerBalance(manager, sale.customerId, -refundTotalMinor);
      }

      const after = await manager.find(SaleItem, { where: { saleId } });
      const allBack = after.every((i) => i.returnedQuantity >= i.quantity);
      await manager.update(
        Sale,
        { id: saleId },
        { status: allBack ? 'returned' : 'partial_return' },
      );

      return saleReturn.id;
    });
  }

  async listForSale(saleId: number): Promise<SaleReturn[]> {
    return this.dataSource.getRepository(SaleReturn).find({
      where: { saleId },
      relations: { items: { saleItem: true } },
      order: { id: 'ASC' },
    });
  }

  /**
   * Puts units back into the batch they were sold from. If that batch is
   * gone (legacy sale, or the row was removed) they go into a new undated
   * batch so the count is still right. An expired batch is restocked as-is
   * and shows up in the expired list for write-off — the stock is real.
   */
  private async restock(
    manager: EntityManager,
    input: {
      variantId: number;
      batchId: number | null;
      quantity: number;
      saleId: number;
      userId: number;
      note: string;
    },
  ): Promise<void> {
    const batch =
      input.batchId === null
        ? null
        : await manager.findOne(StockBatch, { where: { id: input.batchId } });
    if (batch) {
      await this.stockService.addToBatch(manager, batch, {
        type: 'sale_return',
        quantity: input.quantity,
        referenceType: 'sale',
        referenceId: input.saleId,
        note: input.note,
        userId: input.userId,
      });
      return;
    }
    await this.stockService.createBatch(manager, {
      variantId: input.variantId,
      batchNo: null,
      expiryDate: null,
      costPrice: null,
      quantity: input.quantity,
      userId: input.userId,
      type: 'sale_return',
      referenceType: 'sale',
      referenceId: input.saleId,
      note: input.note,
    });
  }
}
