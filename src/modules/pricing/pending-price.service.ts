import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { ProductVariant } from '../product-variants/entities/product-variant.entity';
import { VariantUnit } from '../product-variants/entities/variant-unit.entity';
import { StockBatch } from '../stock/entities/stock-batch.entity';
import { PendingUnitPrice, VariantPendingPrice } from './entities/variant-pending-price.entity';
import { describeLadderChange, unitSnapshot } from './ladder-diff';

export interface UnitPriceInput {
  unit_name: string;
  qty_in_base: number;
  price: number;
}

/**
 * Selling prices set from a delivery. Either applied on the spot, or parked
 * until the stock that was there before that delivery has sold out — so packs
 * with the old MRP printed on them go at the old price and the new packs at
 * the new one, without anyone having to remember to flip it.
 */
@Injectable()
export class PendingPriceService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  /** Writes the given unit prices now. Units not mentioned keep their price. */
  async applyNow(
    manager: EntityManager,
    variantId: number,
    prices: UnitPriceInput[],
    userId: number | null,
    reason: string,
  ): Promise<string[]> {
    const before = await manager.find(VariantUnit, { where: { variantId }, order: { sortOrder: 'ASC' } });
    const units = await this.ensureUnits(manager, variantId, prices);
    for (const p of prices) {
      const unit = units.get(p.unit_name.trim().toLowerCase())!;
      await manager.update(VariantUnit, { id: unit.id }, { price: p.price });
    }
    const after = await manager.find(VariantUnit, { where: { variantId }, order: { sortOrder: 'ASC' } });
    const changes = describeLadderChange(before, after);
    if (changes.length === 0) return [];

    const shown = after.find((u) => u.isDefault) ?? after[0];
    await manager.update(
      ProductVariant,
      { id: variantId },
      { price: shown?.price ?? null, priceUpdatedAt: new Date() },
    );
    await this.auditService.record(
      {
        userId,
        action: 'price.update',
        entityType: 'variant',
        entityId: variantId,
        summary: `${await this.labelFor(manager, variantId)}: ${changes.join(', ')} (${reason})`,
        details: { before: before.map(unitSnapshot), after: after.map(unitSnapshot), reason },
      },
      manager,
    );
    return changes;
  }

  /**
   * Parks the prices until every batch older than `afterBatchId` is sold out.
   * If there is no sellable old stock the prices simply apply now.
   */
  async schedule(
    manager: EntityManager,
    variantId: number,
    afterBatchId: number,
    prices: UnitPriceInput[],
    userId: number | null,
  ): Promise<'applied' | 'scheduled'> {
    const oldLeft = await this.oldStockLeft(manager, variantId, afterBatchId);
    if (oldLeft === 0) {
      await this.applyNow(manager, variantId, prices, userId, 'no old stock left');
      return 'applied';
    }
    // The units themselves are created straight away — only the price waits.
    const units = await this.ensureUnits(manager, variantId, prices);
    const unitPrices: PendingUnitPrice[] = prices.map((p) => {
      const unit = units.get(p.unit_name.trim().toLowerCase())!;
      return { unit_id: unit.id, unit_name: unit.name, qty_in_base: unit.qtyInBase, price: p.price };
    });
    await manager.delete(VariantPendingPrice, { variantId });
    await manager.save(
      manager.create(VariantPendingPrice, { variantId, afterBatchId, unitPrices, createdById: userId }),
    );
    await this.auditService.record(
      {
        userId,
        action: 'price.schedule',
        entityType: 'variant',
        entityId: variantId,
        summary: `${await this.labelFor(manager, variantId)}: new price ${unitPrices
          .map((u) => `${u.unit_name} ${u.price.toFixed(2)}`)
          .join(', ')} once ${oldLeft} old units sell out`,
        details: { after_batch_id: afterBatchId, unit_prices: unitPrices, old_stock_left: oldLeft },
      },
      manager,
    );
    return 'scheduled';
  }

  /**
   * Called after anything that lowers stock. Applies the parked price the
   * moment the old batches are gone. Safe to call when nothing is pending.
   */
  async activateIfDue(manager: EntityManager, variantId: number, userId: number | null): Promise<boolean> {
    const pending = await manager.findOne(VariantPendingPrice, { where: { variantId } });
    if (!pending) return false;
    const oldLeft = await this.oldStockLeft(manager, variantId, pending.afterBatchId);
    if (oldLeft > 0) return false;
    await this.applyNow(manager, variantId, pending.unitPrices, userId, 'old stock sold out');
    await manager.delete(VariantPendingPrice, { id: pending.id });
    return true;
  }

  /** Pending rows for many variants at once, each with its old-stock count. */
  async forVariants(manager: EntityManager, variantIds: number[]): Promise<Map<number, VariantPendingPrice>> {
    const out = new Map<number, VariantPendingPrice>();
    if (variantIds.length === 0) return out;
    const rows = await manager.find(VariantPendingPrice, { where: { variantId: In(variantIds) } });
    for (const row of rows) {
      row.oldStockLeft = await this.oldStockLeft(manager, row.variantId, row.afterBatchId);
      out.set(row.variantId, row);
    }
    return out;
  }

  async forVariant(variantId: number): Promise<VariantPendingPrice | null> {
    return this.dataSource.transaction(async (manager) => {
      const pending = await manager.findOne(VariantPendingPrice, { where: { variantId } });
      if (!pending) return null;
      pending.oldStockLeft = await this.oldStockLeft(manager, variantId, pending.afterBatchId);
      return pending;
    });
  }

  /** Owner decided not to wait: the parked price goes live now. */
  async applyPendingNow(variantId: number, userId: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const pending = await manager.findOne(VariantPendingPrice, { where: { variantId } });
      if (!pending) throw new NotFoundException('Nothing is waiting to be applied for this medicine.');
      await this.applyNow(manager, variantId, pending.unitPrices, userId, 'applied early by owner');
      await manager.delete(VariantPendingPrice, { id: pending.id });
    });
  }

  async cancel(variantId: number, userId: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const pending = await manager.findOne(VariantPendingPrice, { where: { variantId } });
      if (!pending) throw new NotFoundException('Nothing is waiting to be applied for this medicine.');
      await manager.delete(VariantPendingPrice, { id: pending.id });
      await this.auditService.record(
        {
          userId,
          action: 'price.schedule.cancel',
          entityType: 'variant',
          entityId: variantId,
          summary: `${await this.labelFor(manager, variantId)}: scheduled price change cancelled`,
          details: { unit_prices: pending.unitPrices },
        },
        manager,
      );
    });
  }

  /**
   * Finds each named unit on the medicine, creating it when it isn't there —
   * most of the catalogue arrives with no sellable units at all, and a
   * delivery is exactly the moment the shop decides how it will be sold.
   */
  private async ensureUnits(
    manager: EntityManager,
    variantId: number,
    prices: UnitPriceInput[],
  ): Promise<Map<string, VariantUnit>> {
    const variant = await manager.findOne(ProductVariant, { where: { id: variantId } });
    if (!variant) throw new NotFoundException(`Product variant ${variantId} not found`);
    const existing = await manager.find(VariantUnit, { where: { variantId }, order: { sortOrder: 'ASC' } });
    const byName = new Map(existing.map((u) => [u.name.toLowerCase(), u]));

    for (const p of prices) {
      const name = p.unit_name.trim().toLowerCase();
      if (name === '') throw new BadRequestException('A unit needs a name.');
      const found = byName.get(name);
      if (found) {
        // Sizes come from the shop: honour a correction like "a strip is 12".
        if (found.qtyInBase !== p.qty_in_base) {
          await manager.update(VariantUnit, { id: found.id }, { qtyInBase: p.qty_in_base });
          found.qtyInBase = p.qty_in_base;
        }
        continue;
      }
      if (existing.some((u) => u.qtyInBase === p.qty_in_base)) {
        throw new BadRequestException(`This medicine already has a unit of ${p.qty_in_base}.`);
      }
      const created = await manager.save(
        manager.create(VariantUnit, {
          variantId,
          name,
          qtyInBase: p.qty_in_base,
          isSellable: true,
          // The smallest unit sells by default, which is how a counter is used.
          isDefault: existing.length === 0 && p.qty_in_base === Math.min(...prices.map((x) => x.qty_in_base)),
          sortOrder: p.qty_in_base,
        }),
      );
      existing.push(created);
      byName.set(name, created);
    }
    // A medicine must have exactly one default unit for the counter to work.
    const all = await manager.find(VariantUnit, { where: { variantId }, order: { sortOrder: 'ASC' } });
    if (all.length > 0 && !all.some((u) => u.isDefault)) {
      await manager.update(VariantUnit, { id: all[0].id }, { isDefault: true });
    }
    return new Map(all.map((u) => [u.name.toLowerCase(), u]));
  }

  /** Sellable base units in batches received before the given one. */
  private async oldStockLeft(manager: EntityManager, variantId: number, afterBatchId: number): Promise<number> {
    const row = await manager
      .createQueryBuilder(StockBatch, 'b')
      .select('COALESCE(SUM(b.quantity), 0)', 'qty')
      .where('b.variant_id = :variantId', { variantId })
      .andWhere('b.id < :afterBatchId', { afterBatchId })
      .andWhere('b.quantity > 0 AND (b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE)')
      .getRawOne<{ qty: string }>();
    return Number(row?.qty ?? 0);
  }

  private async labelFor(manager: EntityManager, variantId: number): Promise<string> {
    const v = await manager.findOne(ProductVariant, { where: { id: variantId }, relations: { product: true } });
    if (!v) return `#${variantId}`;
    return `${v.product.brandName}${v.strength ? ` ${v.strength}` : ''}`;
  }
}
