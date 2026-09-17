import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProductVariant } from '../product-variants/entities/product-variant.entity';
import {
  CivilDateRange,
  PHARMACY_TIME_ZONE,
  civilDateIn,
  resolvePeriod,
  toInstantWindow,
} from './date-range';
import { DashboardSummaryDto } from './dto/dashboard-summary.dto';
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
  ),
  sale_totals AS (
    SELECT
      COALESCE(SUM("total_amount"), 0) AS total_earning,
      COUNT(*)                         AS total_transactions
    FROM window_sales
  ),
  item_totals AS (
    SELECT
      COALESCE(SUM(si."quantity"), 0)         AS total_units_sold,
      COUNT(DISTINCT si."product_variant_id") AS distinct_products_sold
    FROM "sale_items" si
    JOIN window_sales ws ON ws."id" = si."sale_id"
  )
  SELECT * FROM sale_totals, item_totals
`;

/** `pg` hands back NUMERIC and bigint COUNT columns as strings. */
interface SummaryRow {
  total_earning: string;
  total_transactions: string;
  total_units_sold: string;
  distinct_products_sold: string;
}

@Injectable()
export class DashboardService {
  private readonly lowStockThreshold: number;

  constructor(
    @InjectRepository(ProductVariant)
    private readonly variantsRepository: Repository<ProductVariant>,
    @InjectDataSource() private readonly dataSource: DataSource,
    configService: ConfigService,
  ) {
    this.lowStockThreshold =
      configService.getOrThrow<number>('lowStockThreshold');
  }

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
      .andWhere('variant.stockQuantity < :threshold', {
        threshold: this.lowStockThreshold,
      })
      // A withdrawn SKU is not meant to be restocked, so it must not sit in the
      // restock worklist nagging about stock nobody intends to replace.
      .andWhere('variant.isActive = true')
      .orderBy('variant.stockQuantity', 'ASC')
      // Ties broken by id so repeated polls don't reshuffle the widget.
      .addOrderBy('variant.id', 'ASC')
      .getMany();

    return variants.map((variant) => ({
      variant_id: variant.id,
      brand_name: variant.product.brandName,
      dosage_form: variant.dosageForm,
      strength: variant.strength,
      manufacturer: variant.product.manufacturer.name,
      // Non-null: the IS NOT NULL filter above is what this list selects on.
      stock_quantity: variant.stockQuantity!,
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
      total_units_sold: Number(row.total_units_sold),
      total_transactions: Number(row.total_transactions),
      distinct_products_sold: Number(row.distinct_products_sold),
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
