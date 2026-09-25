import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProductVariant } from '../product-variants/entities/product-variant.entity';
import { SettingsService } from '../settings/settings.service';
import {
  CivilDateRange,
  PHARMACY_TIME_ZONE,
  civilDateIn,
  resolvePeriod,
  toInstantWindow,
} from './date-range';
import { DashboardSummaryDto } from './dto/dashboard-summary.dto';
import { OutstandingDto } from './dto/outstanding.dto';
import { LowStockItemDto } from './dto/low-stock-item.dto';
import { SummaryQueryDto } from './dto/summary-query.dto';

/**
 * Sale-level and item-level figures are counted over separate grains and only
 * then combined.
 *
 * Doing this as one `sales JOIN sale_items` would silently inflate the money:
 * the join yields a row per *line*, so SUM(total_amount) adds each sale's total
 * once per line it contains — a three-line sale of 100 would report 300. The
 * two CTEs each aggregate at their own grain; both are un-grouped aggregates so
 * both return exactly one row even over an empty window, which makes the final
 * cross join safe.
 */
const SUMMARY_SQL = `
  WITH window_sales AS (
    SELECT "id", "total_amount"
    FROM "sales"
    WHERE "created_at" >= $1 AND "created_at" < $2
      AND "status" <> 'voided'
  ),
  sale_totals AS (
    SELECT
      COALESCE(SUM("total_amount"), 0) AS gross_earning,
      COUNT(*)                         AS total_transactions
    FROM window_sales
  ),
  refund_totals AS (
    SELECT COALESCE(SUM("refund_amount"), 0) AS total_refunds
    FROM "sale_returns"
    WHERE "created_at" >= $1 AND "created_at" < $2
  ),
  item_totals AS (
    SELECT
      COALESCE(SUM(si."quantity"), 0)         AS total_units_sold,
      COUNT(DISTINCT si."product_variant_id") AS distinct_products_sold
    FROM "sale_items" si
    JOIN window_sales ws ON ws."id" = si."sale_id"
  )
  SELECT
    sale_totals.gross_earning - refund_totals.total_refunds AS total_earning,
    refund_totals.total_refunds,
    sale_totals.total_transactions,
    item_totals.total_units_sold,
    item_totals.distinct_products_sold
  FROM sale_totals, refund_totals, item_totals
`;

/**
 * Credit in both directions, in one round trip. The balances are kept on the
 * customer and supplier rows, so they are summed directly; the dates come from
 * the bills behind them, which is what makes "owed since" honest.
 */
const OUTSTANDING_SQL = `
  SELECT
    (SELECT COALESCE(SUM(due_balance), 0) FROM customers WHERE due_balance > 0) AS customers_owe,
    (SELECT COUNT(*) FROM customers WHERE due_balance > 0)                      AS customers_count,
    (SELECT MIN(s.created_at)::date::text
       FROM sales s JOIN customers c ON c.id = s.customer_id
      WHERE s.due_amount > 0 AND s.status <> 'voided' AND c.due_balance > 0)    AS customers_oldest,
    (SELECT COALESCE(SUM(due_balance), 0) FROM suppliers WHERE due_balance > 0) AS shop_owes,
    (SELECT COUNT(*) FROM suppliers WHERE due_balance > 0)                      AS suppliers_count,
    (SELECT MIN(r.received_at)::text
       FROM stock_receipts r JOIN suppliers sp ON sp.id = r.supplier_id
      WHERE r.paid_amount < r.total_cost AND sp.due_balance > 0)                AS suppliers_oldest
`;

/** Base units in batches that can still be sold. Mirrors StockService.SELLABLE_BATCH_WHERE. */
const SELLABLE_STOCK_SQL = `(
  SELECT COALESCE(SUM(b.quantity), 0) FROM stock_batches b
  WHERE b.variant_id = variant.id AND b.quantity > 0
    AND (b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE)
)`;

interface OutstandingRow {
  customers_owe: string;
  customers_count: string;
  customers_oldest: string | null;
  shop_owes: string;
  suppliers_count: string;
  suppliers_oldest: string | null;
}

/** `pg` hands back NUMERIC and bigint COUNT columns as strings. */
interface SummaryRow {
  total_earning: string;
  total_refunds: string;
  total_transactions: string;
  total_units_sold: string;
  distinct_products_sold: string;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(ProductVariant)
    private readonly variantsRepository: Repository<ProductVariant>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Everything currently below the restock threshold, most urgent first.
   * Computed live against `product_variants`, so it can never disagree with
   * actual stock the way a persisted alerts table would.
   */
  async lowStock(): Promise<LowStockItemDto[]> {
    const variants = await this.variantsRepository
      .createQueryBuilder('variant')
      .innerJoinAndSelect('variant.product', 'product')
      .innerJoinAndSelect('product.manufacturer', 'manufacturer')
      // A null stock means "never counted", which is not the same as low — and
      // it would drop out of the comparison below anyway, since NULL < 5 is
      // NULL rather than true. Stated outright so that isn't load-bearing.
      .where('variant.stockQuantity IS NOT NULL')
      // Expired batches don't count as stock you can sell, so a shelf full of
      // expired strips still shows up here.
      .addSelect(SELLABLE_STOCK_SQL, 'sellable')
      // A SKU's own reorder level wins; the shop-wide number is the fallback.
      .andWhere(`${SELLABLE_STOCK_SQL} < COALESCE(variant.reorderLevel, :threshold)`, {
        threshold: await this.settingsService.lowStockThreshold(),
      })
      // A withdrawn SKU is not meant to be restocked, so it must not sit in the
      // restock worklist nagging about stock nobody intends to replace.
      .andWhere('variant.isActive = true')
      .orderBy('sellable', 'ASC')
      // Ties broken by id so repeated polls don't reshuffle the widget.
      .addOrderBy('variant.id', 'ASC')
      .getRawAndEntities();

    return variants.entities.map((variant, i) => ({
      variant_id: variant.id,
      brand_name: variant.product.brandName,
      dosage_form: variant.dosageForm,
      strength: variant.strength,
      manufacturer: variant.product.manufacturer.name,
      stock_quantity: Number(
        (variants.raw[i] as { sellable: string | number }).sellable,
      ),
      base_unit: variant.baseUnit,
    }));
  }

  async summary(query: SummaryQueryDto): Promise<DashboardSummaryDto> {
    const period = this.resolveRange(query);
    const window = toInstantWindow(period, PHARMACY_TIME_ZONE);

    const rows: SummaryRow[] = await this.dataSource.query(SUMMARY_SQL, [
      window.start,
      window.endExclusive,
    ]);
    const row = rows[0];

    return {
      period,
      // Postgres sums NUMERIC exactly, so this is a single conversion off a
      // fixed 2-decimal string — no float drift to accumulate.
      total_earning: Number(row.total_earning),
      total_refunds: Number(row.total_refunds),
      total_units_sold: Number(row.total_units_sold),
      total_transactions: Number(row.total_transactions),
      distinct_products_sold: Number(row.distinct_products_sold),
    };
  }

  /** What the shop is owed and what it owes, as of now. */
  async outstanding(): Promise<OutstandingDto> {
    const rows: OutstandingRow[] = await this.dataSource.query(OUTSTANDING_SQL);
    const row = rows[0];
    return {
      customers_owe: Number(row.customers_owe),
      customers_count: Number(row.customers_count),
      customers_oldest: row.customers_oldest,
      shop_owes: Number(row.shop_owes),
      suppliers_count: Number(row.suppliers_count),
      suppliers_oldest: row.suppliers_oldest,
    };
  }

  /** Custom range beats preset; falls back to today when neither is given. */
  private resolveRange(query: SummaryQueryDto): CivilDateRange {
    if (query.from !== undefined || query.to !== undefined) {
      if (query.from === undefined || query.to === undefined) {
        throw new BadRequestException(
          'Send `from` and `to` together for a custom range, or neither and use `period`.',
        );
      }
      // Both are YYYY-MM-DD, so lexicographic order is chronological order.
      if (query.from > query.to) {
        throw new BadRequestException('`from` must not be later than `to`.');
      }
      return { from: query.from, to: query.to };
    }

    // Presets are relative to the pharmacy's own calendar day. Deriving "today"
    // from UTC would move the boundary six hours into the previous evening.
    const today = civilDateIn(new Date(), PHARMACY_TIME_ZONE);
    return resolvePeriod(query.period ?? 'today', today);
  }
}
