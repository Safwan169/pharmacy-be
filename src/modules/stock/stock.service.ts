import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ProductVariant } from '../product-variants/entities/product-variant.entity';
import { StockBatch } from './entities/stock-batch.entity';
import { MovementType, StockMovement } from './entities/stock-movement.entity';

export interface BatchAllocation {
  batch: StockBatch;
  quantity: number;
}

export type AllocationFailure = 'insufficient' | 'expired_only';

export interface MovementInput {
  variantId: number;
  batchId: number | null;
  type: MovementType;
  /** Signed, in base units. */
  quantity: number;
  referenceType?: string;
  referenceId?: number;
  note?: string;
  userId: number | null;
}

/** Only batches that can still be sold: some quantity, and not past expiry. */
export const SELLABLE_BATCH_WHERE =
  'b.quantity > 0 AND (b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE)';

/**
 * Every stock change goes through here so the invariant
 * `product_variants.stock_quantity = SUM(stock_batches.quantity)` holds and a
 * ledger row exists for it. Callers pass the transaction's EntityManager.
 */
@Injectable()
export class StockService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(StockBatch)
    private readonly batchesRepository: Repository<StockBatch>,
  ) {}

  /**
   * Picks batches for a sale, soonest expiry first, skipping expired ones.
   * Returns allocations or the reason nothing could be allocated. Pure read —
   * the caller deducts with `deductAllocation` so the conditional update can
   * catch a concurrent sale.
   */
  async allocate(
    manager: EntityManager,
    variantId: number,
    baseQty: number,
  ): Promise<
    | { ok: true; allocations: BatchAllocation[] }
    | { ok: false; reason: AllocationFailure; available: number }
  > {
    const batches = await manager
      .createQueryBuilder(StockBatch, 'b')
      .where('b.variant_id = :variantId', { variantId })
      .andWhere(SELLABLE_BATCH_WHERE)
      .orderBy('b.expiry_date', 'ASC', 'NULLS LAST')
      .addOrderBy('b.id', 'ASC')
      .getMany();

    const available = batches.reduce((sum, b) => sum + b.quantity, 0);
    if (available < baseQty) {
      if (available === 0) {
        const expiredQty = await manager
          .createQueryBuilder(StockBatch, 'b')
          .select('COALESCE(SUM(b.quantity), 0)', 'qty')
          .where('b.variant_id = :variantId', { variantId })
          .andWhere('b.quantity > 0')
          .getRawOne<{ qty: string }>();
        if (Number(expiredQty?.qty ?? 0) > 0) {
          return { ok: false, reason: 'expired_only', available: 0 };
        }
      }
      return { ok: false, reason: 'insufficient', available };
    }

    const allocations: BatchAllocation[] = [];
    let remaining = baseQty;
    for (const batch of batches) {
      if (remaining === 0) break;
      const take = Math.min(batch.quantity, remaining);
      allocations.push({ batch, quantity: take });
      remaining -= take;
    }
    return { ok: true, allocations };
  }

  /**
   * Takes one allocation off its batch and off the variant total. Both are
   * conditional updates: zero affected rows means the stock moved under us and
   * the caller should roll back and report `stock_changed`.
   */
  async deductAllocation(
    manager: EntityManager,
    allocation: BatchAllocation,
    reference: { type: string; id: number },
    userId: number,
  ): Promise<boolean> {
    const batchResult = await manager
      .createQueryBuilder()
      .update(StockBatch)
      .set({ quantity: () => 'quantity - :take' })
      .setParameter('take', allocation.quantity)
      .where('id = :id', { id: allocation.batch.id })
      .andWhere('quantity >= :take')
      .andWhere('(expiry_date IS NULL OR expiry_date >= CURRENT_DATE)')
      .execute();
    if (batchResult.affected !== 1) return false;

    const variantResult = await manager
      .createQueryBuilder()
      .update(ProductVariant)
      .set({ stockQuantity: () => 'stock_quantity - :take' })
      .setParameter('take', allocation.quantity)
      .where('id = :id', { id: allocation.batch.variantId })
      .andWhere('stock_quantity >= :take')
      .andWhere('is_active = true')
      .returning('stock_quantity')
      .execute();
    if (variantResult.affected !== 1) return false;

    const newStock = Number(
      (variantResult.raw as { stock_quantity: number }[])[0].stock_quantity,
    );
    await manager.insert(StockMovement, {
      variantId: allocation.batch.variantId,
      batchId: allocation.batch.id,
      type: 'sale',
      quantity: -allocation.quantity,
      previousStock: newStock + allocation.quantity,
      newStock,
      referenceType: reference.type,
      referenceId: reference.id,
      createdById: userId,
    });
    return true;
  }

  /** Adds stock into a specific batch (a return, or a receipt). */
  async addToBatch(
    manager: EntityManager,
    batch: StockBatch,
    input: Omit<MovementInput, 'variantId' | 'batchId'>,
  ): Promise<void> {
    if (input.quantity <= 0) {
      throw new BadRequestException('Quantity must be positive.');
    }
    await manager.increment(StockBatch, { id: batch.id }, 'quantity', input.quantity);
    await this.bumpVariant(manager, {
      ...input,
      variantId: batch.variantId,
      batchId: batch.id,
    });
  }

  /** Creates a new batch holding `quantity` base units. */
  async createBatch(
    manager: EntityManager,
    input: {
      variantId: number;
      batchNo: string | null;
      expiryDate: string | null;
      costPrice: number | null;
      quantity: number;
      userId: number | null;
      type: MovementType;
      referenceType?: string;
      referenceId?: number;
      note?: string;
    },
  ): Promise<StockBatch> {
    if (input.quantity <= 0) {
      throw new BadRequestException('Quantity must be positive.');
    }
    const batch = await manager.save(
      manager.create(StockBatch, {
        variantId: input.variantId,
        batchNo: input.batchNo,
        expiryDate: input.expiryDate,
        costPrice: input.costPrice,
        quantity: input.quantity,
        initialQuantity: input.quantity,
        createdById: input.userId,
      }),
    );
    await this.bumpVariant(manager, {
      variantId: input.variantId,
      batchId: batch.id,
      type: input.type,
      quantity: input.quantity,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      note: input.note,
      userId: input.userId,
    });
    return batch;
  }

  /**
   * Sets a variant's stock to an exact count. The difference becomes an
   * `adjustment`: extra goes into a new undated batch; a shortfall is drained
   * from the batches expiring soonest.
   */
  async adjustToCount(
    manager: EntityManager,
    variantId: number,
    newCount: number,
    userId: number | null,
    note?: string,
  ): Promise<void> {
    const variant = await manager.findOne(ProductVariant, {
      where: { id: variantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!variant) {
      throw new NotFoundException(`Product variant ${variantId} not found`);
    }
    const current = variant.stockQuantity ?? 0;
    const diff = newCount - current;

    if (variant.stockQuantity === null) {
      // First count ever: no movement history to reconcile against.
      await manager.update(ProductVariant, { id: variantId }, { stockQuantity: 0 });
    }
    if (diff === 0) {
      if (variant.stockQuantity === null) {
        await manager.update(ProductVariant, { id: variantId }, { stockQuantity: newCount });
      }
      return;
    }

    if (diff > 0) {
      await this.createBatch(manager, {
        variantId,
        batchNo: null,
        expiryDate: null,
        costPrice: null,
        quantity: diff,
        userId,
        type: 'adjustment',
        note: note ?? 'Stock count corrected',
      });
      return;
    }

    let remaining = -diff;
    const batches = await manager
      .createQueryBuilder(StockBatch, 'b')
      .where('b.variant_id = :variantId', { variantId })
      .andWhere('b.quantity > 0')
      .orderBy('b.expiry_date', 'ASC', 'NULLS LAST')
      .addOrderBy('b.id', 'ASC')
      .getMany();
    for (const batch of batches) {
      if (remaining === 0) break;
      const take = Math.min(batch.quantity, remaining);
      await manager.decrement(StockBatch, { id: batch.id }, 'quantity', take);
      await this.bumpVariant(manager, {
        variantId,
        batchId: batch.id,
        type: 'adjustment',
        quantity: -take,
        note: note ?? 'Stock count corrected',
        userId,
      });
      remaining -= take;
    }
    if (remaining > 0) {
      throw new ConflictException(
        'Batches hold less than the recorded total. Reload and try again.',
      );
    }
  }

  /** Zeroes a batch that has expired (or been damaged). */
  async writeOff(
    batchId: number,
    userId: number,
    note?: string,
  ): Promise<StockBatch> {
    return this.dataSource.transaction(async (manager) => {
      const batch = await manager.findOne(StockBatch, {
        where: { id: batchId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!batch) {
        throw new NotFoundException(`Batch ${batchId} not found`);
      }
      if (batch.quantity === 0) return batch;

      const qty = batch.quantity;
      await manager.update(StockBatch, { id: batchId }, { quantity: 0 });
      await this.bumpVariant(manager, {
        variantId: batch.variantId,
        batchId,
        type: 'expired_writeoff',
        quantity: -qty,
        note: note ?? 'Written off',
        userId,
      });
      batch.quantity = 0;
      return batch;
    });
  }

  /** Batches for the catalogue page: everything with stock, plus recent empties. */
  async batchesForVariant(variantId: number): Promise<StockBatch[]> {
    return this.batchesRepository
      .createQueryBuilder('b')
      .where('b.variant_id = :variantId', { variantId })
      .andWhere("(b.quantity > 0 OR b.updated_at >= now() - interval '30 days')")
      .orderBy('b.expiry_date', 'ASC', 'NULLS LAST')
      .addOrderBy('b.id', 'ASC')
      .getMany();
  }

  /** Moves the variant total and writes the ledger row. Batch already updated. */
  private async bumpVariant(
    manager: EntityManager,
    input: MovementInput,
  ): Promise<void> {
    const result = await manager
      .createQueryBuilder()
      .update(ProductVariant)
      .set({ stockQuantity: () => 'COALESCE(stock_quantity, 0) + :delta' })
      .setParameter('delta', input.quantity)
      .where('id = :id', { id: input.variantId })
      .returning('stock_quantity')
      .execute();
    if (result.affected !== 1) {
      throw new NotFoundException(`Product variant ${input.variantId} not found`);
    }
    const newStock = Number(
      (result.raw as { stock_quantity: number }[])[0].stock_quantity,
    );
    await manager.insert(StockMovement, {
      variantId: input.variantId,
      batchId: input.batchId,
      type: input.type,
      quantity: input.quantity,
      previousStock: newStock - input.quantity,
      newStock,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      note: input.note ?? null,
      createdById: input.userId,
    });
  }
}
