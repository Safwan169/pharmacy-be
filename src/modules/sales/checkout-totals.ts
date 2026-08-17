import { fromMinorUnits, toMinorUnits } from '../../common/money';
import type { DiscountType } from './entities/sale.entity';

export interface PricedLine {
  unitPrice: number;
  quantity: number;
}

export interface AppliedDiscount {
  type: DiscountType;
  value: number;
}

export interface CheckoutTotals {
  /** Per-line totals, in the same order as the input. */
  lineTotals: number[];
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
}

/**
 * The whole money calculation for a checkout, kept free of database access so
 * it can be tested directly.
 *
 * The discount applies once to the subtotal, never per line, and is clamped to
 * the subtotal so the total can never go negative.
 */
export function computeCheckoutTotals(
  lines: PricedLine[],
  discount?: AppliedDiscount,
): CheckoutTotals {
  const lineTotalsMinor = lines.map(
    (line) => toMinorUnits(line.unitPrice) * line.quantity,
  );
  const subtotalMinor = lineTotalsMinor.reduce((sum, line) => sum + line, 0);

  let discountMinor = 0;
  if (discount !== undefined) {
    discountMinor =
      discount.type === 'percentage'
        ? Math.round((subtotalMinor * discount.value) / 100)
        : toMinorUnits(discount.value);
  }
  // Never below zero, never more than the subtotal.
  discountMinor = Math.max(0, Math.min(discountMinor, subtotalMinor));

  return {
    lineTotals: lineTotalsMinor.map(fromMinorUnits),
    subtotal: fromMinorUnits(subtotalMinor),
    discountAmount: fromMinorUnits(discountMinor),
    totalAmount: fromMinorUnits(subtotalMinor - discountMinor),
  };
}

/** `INV-20260817-0007` — date plus that day's counter. */
export function formatInvoiceNumber(dayKey: string, sequence: number): string {
  return `INV-${dayKey}-${String(sequence).padStart(4, '0')}`;
}
