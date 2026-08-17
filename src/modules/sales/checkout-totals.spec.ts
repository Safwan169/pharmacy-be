import { computeCheckoutTotals, formatInvoiceNumber } from './checkout-totals';

describe('computeCheckoutTotals', () => {
  it('matches the worked example from the spec', () => {
    // Item A: qty 2 @ 50 = 100; Item B: qty 1 @ 200 = 200; 10% off 300 = 30.
    const totals = computeCheckoutTotals(
      [
        { unitPrice: 50, quantity: 2 },
        { unitPrice: 200, quantity: 1 },
      ],
      { type: 'percentage', value: 10 },
    );

    expect(totals.lineTotals).toEqual([100, 200]);
    expect(totals.subtotal).toBe(300);
    expect(totals.discountAmount).toBe(30);
    expect(totals.totalAmount).toBe(270);
  });

  it('applies no discount when none is given', () => {
    const totals = computeCheckoutTotals([{ unitPrice: 19.99, quantity: 3 }]);

    expect(totals.subtotal).toBe(59.97);
    expect(totals.discountAmount).toBe(0);
    expect(totals.totalAmount).toBe(59.97);
  });

  it('caps a flat discount at the subtotal so the total never goes negative', () => {
    const totals = computeCheckoutTotals([{ unitPrice: 10, quantity: 1 }], {
      type: 'flat',
      value: 500,
    });

    expect(totals.discountAmount).toBe(10);
    expect(totals.totalAmount).toBe(0);
  });

  it('treats a 100% discount as a free sale rather than a negative total', () => {
    const totals = computeCheckoutTotals([{ unitPrice: 42.5, quantity: 2 }], {
      type: 'percentage',
      value: 100,
    });

    expect(totals.subtotal).toBe(85);
    expect(totals.discountAmount).toBe(85);
    expect(totals.totalAmount).toBe(0);
  });

  it('subtracts a flat discount that is smaller than the subtotal', () => {
    const totals = computeCheckoutTotals([{ unitPrice: 120, quantity: 1 }], {
      type: 'flat',
      value: 20.5,
    });

    expect(totals.discountAmount).toBe(20.5);
    expect(totals.totalAmount).toBe(99.5);
  });

  it('keeps cent-level precision instead of drifting into float error', () => {
    // 33.33 * 3 = 99.99; a naive float 15% would give 14.998499999999998.
    const totals = computeCheckoutTotals([{ unitPrice: 33.33, quantity: 3 }], {
      type: 'percentage',
      value: 15,
    });

    expect(totals.subtotal).toBe(99.99);
    expect(totals.discountAmount).toBe(15);
    expect(totals.totalAmount).toBe(84.99);
    // Guard against a long float tail sneaking into a NUMERIC(10,2) column.
    for (const amount of [
      totals.subtotal,
      totals.discountAmount,
      totals.totalAmount,
    ]) {
      expect(Number(amount.toFixed(2))).toBe(amount);
    }
  });

  it('sums many lines without accumulating rounding error', () => {
    const lines = Array.from({ length: 100 }, () => ({
      unitPrice: 0.07,
      quantity: 3,
    }));
    const totals = computeCheckoutTotals(lines);

    expect(totals.subtotal).toBe(21);
    expect(totals.totalAmount).toBe(21);
  });

  it('handles a zero-value discount as no discount at all', () => {
    const totals = computeCheckoutTotals([{ unitPrice: 10, quantity: 1 }], {
      type: 'percentage',
      value: 0,
    });

    expect(totals.discountAmount).toBe(0);
    expect(totals.totalAmount).toBe(10);
  });
});

describe('formatInvoiceNumber', () => {
  it('zero-pads the daily sequence to four digits', () => {
    expect(formatInvoiceNumber('20260817', 7)).toBe('INV-20260817-0007');
    expect(formatInvoiceNumber('20260817', 1)).toBe('INV-20260817-0001');
  });

  it('keeps growing past the padding width rather than truncating', () => {
    expect(formatInvoiceNumber('20260817', 12345)).toBe('INV-20260817-12345');
  });
});
