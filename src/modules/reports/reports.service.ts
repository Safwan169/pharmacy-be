import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  PHARMACY_TIME_ZONE,
  civilDateIn,
  toInstantWindow,
} from '../dashboard/date-range';
import {
  DailyClosingDto,
  ProfitDayDto,
  ProfitReportDto,
  StockValueDto,
} from './dto/reports.dto';

const n = (v: unknown): number => Number(v ?? 0);

/**
 * The owner's three money questions, answered straight from sales, returns,
 * due payments and batches. Every window is a Dhaka civil day converted to
 * instants once (see date-range.ts). All SQL is at the right grain — sales
 * totals from `sales`, lines from `sale_items` — never a join that would
 * count a total once per line.
 */
/**
 * Everything the drawer took in and paid out before a given instant. The shop
 * opened with nothing, so the running total is the opening balance — no count
 * and no typing, which is the point.
 */
const OPENING_CASH_SQL = `
  SELECT
    (SELECT COALESCE(SUM(total_amount), 0) FROM sales
      WHERE status <> 'voided' AND payment_method = 'cash' AND created_at < $1)
  + (SELECT COALESCE(SUM(amount), 0) FROM due_payments
      WHERE method = 'cash' AND created_at < $1)
  - (SELECT COALESCE(SUM(refund_amount), 0) FROM sale_returns
      WHERE refund_method = 'cash' AND created_at < $1)
  - (SELECT COALESCE(SUM(amount), 0) FROM supplier_payments
      WHERE method = 'cash' AND from_drawer = true AND created_at < $1)
  AS opening_cash
`;

@Injectable()
export class ReportsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async dailyClosing(date: string | undefined, onlyCashierId?: number): Promise<DailyClosingDto> {
    const day = date ?? civilDateIn(new Date(), PHARMACY_TIME_ZONE);
    const { start, endExclusive } = toInstantWindow({ from: day, to: day }, PHARMACY_TIME_ZONE);
    const cashierFilter = onlyCashierId === undefined ? '' : 'AND s.created_by = $3';
    const params: unknown[] = onlyCashierId === undefined ? [start, endExclusive] : [start, endExclusive, onlyCashierId];

    const [totals] = (await this.dataSource.query(
      `SELECT
         COUNT(*) FILTER (WHERE s.status <> 'voided')                                  AS sales_count,
         COALESCE(SUM(s.total_amount)    FILTER (WHERE s.status <> 'voided'), 0)       AS gross_sales,
         COALESCE(SUM(s.discount_amount) FILTER (WHERE s.status <> 'voided'), 0)       AS discounts,
         COALESCE(SUM(s.total_amount) FILTER (WHERE s.status <> 'voided' AND s.payment_method = 'cash'), 0)  AS cash,
         COALESCE(SUM(s.total_amount) FILTER (WHERE s.status <> 'voided' AND s.payment_method = 'bkash'), 0) AS bkash,
         COALESCE(SUM(s.total_amount) FILTER (WHERE s.status <> 'voided' AND s.payment_method = 'due'), 0)   AS due,
         COUNT(*) FILTER (WHERE s.status = 'voided')                                   AS voided_count
       FROM sales s
       WHERE s.created_at >= $1 AND s.created_at < $2 ${cashierFilter}`,
      params,
    )) as Record<string, string>[];

    const [refunds] = (await this.dataSource.query(
      `SELECT
         COALESCE(SUM(r.refund_amount), 0)                                          AS total,
         COALESCE(SUM(r.refund_amount) FILTER (WHERE r.refund_method = 'cash'), 0)  AS cash,
         COALESCE(SUM(r.refund_amount) FILTER (WHERE r.refund_method = 'bkash'), 0) AS bkash,
         COALESCE(SUM(r.refund_amount) FILTER (WHERE r.refund_method = 'due_adjust'), 0) AS due_adjust
       FROM sale_returns r
       WHERE r.created_at >= $1 AND r.created_at < $2 ${onlyCashierId === undefined ? '' : 'AND r.created_by = $3'}`,
      params,
    )) as Record<string, string>[];

    const [collected] = (await this.dataSource.query(
      `SELECT
         COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'cash'), 0)  AS cash,
         COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'bkash'), 0) AS bkash
       FROM due_payments p
       WHERE p.created_at >= $1 AND p.created_at < $2 ${onlyCashierId === undefined ? '' : 'AND p.created_by = $3'}`,
      params,
    )) as Record<string, string>[];

    // Money handed to suppliers today leaves the drawer just like a refund —
    // unless it never came from the drawer, which the payment itself records.
    const [supplierPaid] = (await this.dataSource.query(
      `SELECT
         COALESCE(SUM(sp.amount) FILTER (WHERE sp.method = 'cash'), 0)  AS cash,
         COALESCE(SUM(sp.amount) FILTER (WHERE sp.method = 'bkash'), 0) AS bkash,
         COALESCE(SUM(sp.amount) FILTER (WHERE sp.method = 'cash' AND sp.from_drawer = false), 0) AS cash_outside
       FROM supplier_payments sp
       WHERE sp.created_at >= $1 AND sp.created_at < $2 ${onlyCashierId === undefined ? '' : 'AND sp.created_by = $3'}`,
      params,
    )) as Record<string, string>[];

    // What the drawer had before the day opened: every taking and every payout
    // since the shop began. Nobody counts or types it, so it can never be
    // forgotten — and it is what stops a day of heavy supplier payments from
    // reporting a negative drawer. A single cashier's view has no such balance.
    const openingCash =
      onlyCashierId === undefined
        ? n(
            (
              (await this.dataSource.query(OPENING_CASH_SQL, [start])) as Record<
                string,
                string
              >[]
            )[0].opening_cash,
          )
        : null;

    const topItems = (await this.dataSource.query(
      `SELECT si.product_variant_id AS variant_id,
              MAX(si.brand_name_snapshot || COALESCE(' ' || si.strength_snapshot, '')) AS name,
              si.unit_name_snapshot AS unit,
              SUM(si.quantity) AS quantity,
              SUM(si.line_total) AS amount
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       WHERE s.created_at >= $1 AND s.created_at < $2 AND s.status <> 'voided' ${cashierFilter}
       GROUP BY si.product_variant_id, si.unit_name_snapshot
       ORDER BY amount DESC
       LIMIT 10`,
      params,
    )) as Record<string, string>[];

    const cashiers = (await this.dataSource.query(
      `SELECT s.created_by AS user_id,
              COALESCE(MAX(u.name), MAX(u.email)) AS name,
              COUNT(*) AS sales_count,
              COALESCE(SUM(s.total_amount), 0) AS amount
       FROM sales s
       JOIN users u ON u.id = s.created_by
       WHERE s.created_at >= $1 AND s.created_at < $2 AND s.status <> 'voided' ${cashierFilter}
       GROUP BY s.created_by
       ORDER BY amount DESC`,
      params,
    )) as Record<string, string>[];

    const gross = n(totals.gross_sales);
    const refundTotal = n(refunds.total);
    return {
      date: day,
      sales_count: n(totals.sales_count),
      gross_sales: gross,
      discounts: n(totals.discounts),
      refunds: refundTotal,
      net_sales: round2(gross - refundTotal),
      by_method: { cash: n(totals.cash), bkash: n(totals.bkash), due: n(totals.due) },
      refunds_by_method: { cash: n(refunds.cash), bkash: n(refunds.bkash), due_adjust: n(refunds.due_adjust) },
      due_collected: { cash: n(collected.cash), bkash: n(collected.bkash) },
      supplier_paid: {
        cash: n(supplierPaid.cash),
        bkash: n(supplierPaid.bkash),
        cash_outside: n(supplierPaid.cash_outside),
      },
      opening_cash: openingCash,
      cash_in_drawer_expected: round2(
        (openingCash ?? 0) +
          n(totals.cash) +
          n(collected.cash) -
          n(refunds.cash) -
          (n(supplierPaid.cash) - n(supplierPaid.cash_outside)),
      ),
      voided_count: n(totals.voided_count),
      top_items: topItems.map((r) => ({
        variant_id: n(r.variant_id),
        name: r.name,
        unit: r.unit,
        quantity: n(r.quantity),
        amount: n(r.amount),
      })),
      cashier_breakdown: cashiers.map((r) => ({
        user_id: n(r.user_id),
        name: r.name,
        sales_count: n(r.sales_count),
        amount: n(r.amount),
      })),
    };
  }

  async profit(from: string, to: string): Promise<ProfitReportDto> {
    if (from > to) throw new BadRequestException('from must not be after to.');
    const { start, endExclusive } = toInstantWindow({ from, to }, PHARMACY_TIME_ZONE);
    const params = [start, endExclusive, PHARMACY_TIME_ZONE];

    // Revenue at the sale grain (after discount, minus refunds); cost at the
    // line grain from the batch each line drew on; returned & restocked
    // units give their cost back.
    const days = (await this.dataSource.query(
      `WITH sale_days AS (
         SELECT to_char(s.created_at AT TIME ZONE $3, 'YYYY-MM-DD') AS day,
                SUM(s.total_amount) AS revenue
         FROM sales s
         WHERE s.created_at >= $1 AND s.created_at < $2 AND s.status <> 'voided'
         GROUP BY 1
       ),
       refund_days AS (
         SELECT to_char(r.created_at AT TIME ZONE $3, 'YYYY-MM-DD') AS day,
                SUM(r.refund_amount) AS refunds
         FROM sale_returns r
         WHERE r.created_at >= $1 AND r.created_at < $2
         GROUP BY 1
       ),
       cost_days AS (
         SELECT to_char(s.created_at AT TIME ZONE $3, 'YYYY-MM-DD') AS day,
                SUM(si.base_qty_deducted * COALESCE(b.cost_price, 0)) AS cogs,
                COUNT(*) FILTER (WHERE b.cost_price IS NULL) AS uncosted_lines
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         LEFT JOIN stock_batches b ON b.id = si.batch_id
         WHERE s.created_at >= $1 AND s.created_at < $2 AND s.status <> 'voided'
         GROUP BY 1
       ),
       return_cost_days AS (
         SELECT to_char(r.created_at AT TIME ZONE $3, 'YYYY-MM-DD') AS day,
                SUM(ri.base_quantity * COALESCE(b.cost_price, 0)) AS returned_cost
         FROM sale_return_items ri
         JOIN sale_returns r ON r.id = ri.return_id
         JOIN sale_items si ON si.id = ri.sale_item_id
         LEFT JOIN stock_batches b ON b.id = si.batch_id
         WHERE r.created_at >= $1 AND r.created_at < $2 AND ri.restock = true
         GROUP BY 1
       ),
       all_days AS (
         SELECT day FROM sale_days UNION SELECT day FROM refund_days
         UNION SELECT day FROM cost_days UNION SELECT day FROM return_cost_days
       )
       SELECT d.day,
              COALESCE(sd.revenue, 0) - COALESCE(rd.refunds, 0) AS revenue,
              COALESCE(cd.cogs, 0) - COALESCE(rc.returned_cost, 0) AS cogs,
              COALESCE(cd.uncosted_lines, 0) AS uncosted_lines
       FROM all_days d
       LEFT JOIN sale_days sd ON sd.day = d.day
       LEFT JOIN refund_days rd ON rd.day = d.day
       LEFT JOIN cost_days cd ON cd.day = d.day
       LEFT JOIN return_cost_days rc ON rc.day = d.day
       ORDER BY d.day`,
      params,
    )) as Record<string, string>[];

    const products = (await this.dataSource.query(
      `SELECT si.product_variant_id AS variant_id,
              MAX(si.brand_name_snapshot || COALESCE(' ' || si.strength_snapshot, '') || ' ' || si.dosage_form_snapshot) AS name,
              SUM(si.base_qty_deducted) AS quantity_base,
              SUM(si.line_total) AS revenue,
              SUM(si.base_qty_deducted * COALESCE(b.cost_price, 0)) AS cogs
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       LEFT JOIN stock_batches b ON b.id = si.batch_id
       WHERE s.created_at >= $1 AND s.created_at < $2 AND s.status <> 'voided'
       GROUP BY si.product_variant_id
       ORDER BY (SUM(si.line_total) - SUM(si.base_qty_deducted * COALESCE(b.cost_price, 0))) DESC
       LIMIT 20`,
      [start, endExclusive],
    )) as Record<string, string>[];

    const byDay: ProfitDayDto[] = days.map((r) => toDay(r.day, n(r.revenue), n(r.cogs), n(r.uncosted_lines)));
    const total = toDay(
      `${from}..${to}`,
      byDay.reduce((s, d) => s + d.revenue, 0),
      byDay.reduce((s, d) => s + d.cogs, 0),
      byDay.reduce((s, d) => s + d.uncosted_lines, 0),
    );

    return {
      from,
      to,
      total,
      by_day: byDay,
      by_product: products.map((r) => ({
        variant_id: n(r.variant_id),
        name: r.name,
        quantity_base: n(r.quantity_base),
        revenue: n(r.revenue),
        cogs: round2(n(r.cogs)),
        gross_profit: round2(n(r.revenue) - n(r.cogs)),
      })),
    };
  }

  async stockValue(): Promise<StockValueDto> {
    const [row] = (await this.dataSource.query(
      `SELECT
         COALESCE(SUM(b.quantity * b.cost_price) FILTER (WHERE b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE), 0) AS value_at_cost,
         COALESCE(SUM(b.quantity * v.price)      FILTER (WHERE b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE), 0) AS value_at_price,
         COALESCE(SUM(b.quantity * b.cost_price) FILTER (WHERE b.expiry_date < CURRENT_DATE), 0) AS expired_value_at_cost,
         COALESCE(SUM(b.quantity) FILTER (WHERE b.cost_price IS NULL), 0) AS uncosted_units,
         COUNT(*) AS batches_in_stock,
         COUNT(DISTINCT b.variant_id) AS variants_in_stock
       FROM stock_batches b
       JOIN product_variants v ON v.id = b.variant_id
       WHERE b.quantity > 0`,
    )) as Record<string, string>[];
    return {
      value_at_cost: round2(n(row.value_at_cost)),
      // variant.price is per default unit; convert to per base unit via the
      // default unit's qty_in_base when one exists.
      value_at_price: round2(await this.valueAtPrice()),
      expired_value_at_cost: round2(n(row.expired_value_at_cost)),
      uncosted_units: n(row.uncosted_units),
      batches_in_stock: n(row.batches_in_stock),
      variants_in_stock: n(row.variants_in_stock),
    };
  }

  private async valueAtPrice(): Promise<number> {
    const [row] = (await this.dataSource.query(
      `SELECT COALESCE(SUM(b.quantity * (u.price / u.qty_in_base)), 0) AS value
       FROM stock_batches b
       JOIN variant_units u ON u.variant_id = b.variant_id AND u.is_default = true AND u.price IS NOT NULL
       WHERE b.quantity > 0 AND (b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE)`,
    )) as Record<string, string>[];
    return n(row.value);
  }
}

function toDay(date: string, revenue: number, cogs: number, uncosted: number): ProfitDayDto {
  const profit = round2(revenue - cogs);
  return {
    date,
    revenue: round2(revenue),
    cogs: round2(cogs),
    gross_profit: profit,
    margin_pct: revenue > 0 ? round2((profit / revenue) * 100) : null,
    uncosted_lines: uncosted,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** RFC-4180-ish CSV: quotes anything with a comma, quote or newline. */
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n');
}
