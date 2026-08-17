/**
 * Money arithmetic runs in integer minor units (poisha) and only converts back
 * at the edges. Doing it in floats drifts — `300 * 0.10` is 30.000000000000004,
 * which would persist to a NUMERIC(10,2) column and break invoice totals.
 */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

export function fromMinorUnits(minorUnits: number): number {
  return Math.round(minorUnits) / 100;
}

/** Fixed 2-decimal rendering for invoices and API responses. */
export function formatAmount(amount: number): string {
  return amount.toFixed(2);
}
