import { InvoicePdfService } from './invoice-pdf.service';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';

function buildSale(overrides: Partial<Sale> = {}): Sale {
  const items = [
    {
      id: 1,
      brandNameSnapshot: 'Napa',
      dosageFormSnapshot: 'Tablet',
      strengthSnapshot: '500 mg',
      unitPrice: 50,
      quantity: 2,
      lineTotal: 100,
    },
    {
      id: 2,
      brandNameSnapshot: 'Seclo',
      dosageFormSnapshot: 'Capsule',
      strengthSnapshot: null,
      unitPrice: 200,
      quantity: 1,
      lineTotal: 200,
    },
  ] as SaleItem[];

  return {
    id: 42,
    invoiceNumber: 'INV-20260817-0007',
    subtotal: 300,
    discountType: 'percentage',
    discountValue: 10,
    discountAmount: 30,
    totalAmount: 270,
    paymentMethod: 'cash',
    createdById: 1,
    createdBy: { id: 1, email: 'admin@example.com', role: 'admin' },
    items,
    createdAt: new Date('2026-08-17T10:30:00Z'),
    ...overrides,
  } as Sale;
}

/**
 * pdfkit writes text as hex runs inside kerned `TJ` arrays
 * (`[<4e617061> 50 <54> ...] TJ`), so a plain substring search finds nothing.
 * Concatenating the decoded runs from the content streams rebuilds the drawn
 * text — the kerning numbers are only spacing.
 */
function extractText(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  const parts: string[] = [];

  const streams = /stream\n([\s\S]*?)\nendstream/g;
  let stream: RegExpExecArray | null;
  while ((stream = streams.exec(raw)) !== null) {
    const hexRuns = /<([0-9a-fA-F]+)>/g;
    let run: RegExpExecArray | null;
    while ((run = hexRuns.exec(stream[1])) !== null) {
      parts.push(Buffer.from(run[1], 'hex').toString('latin1'));
    }
  }
  return parts.join('');
}

async function renderText(sale: Sale): Promise<string> {
  const pdf = await new InvoicePdfService().render(sale, { compress: false });
  return extractText(pdf);
}

describe('InvoicePdfService', () => {
  it('produces a structurally valid PDF', async () => {
    const pdf = await new InvoicePdfService().render(buildSale());

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.toString('latin1')).toContain('%%EOF');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('shows the invoice number, totals and payment method', async () => {
    const text = await renderText(buildSale());

    expect(text).toContain('INV-20260817-0007');
    expect(text).toContain('Subtotal');
    expect(text).toContain('300.00');
    expect(text).toContain('270.00');
    expect(text).toContain('cash');
    expect(text).toContain('admin@example.com');
  });

  it('renders line items from the snapshots', async () => {
    const text = await renderText(buildSale());

    expect(text).toContain('Napa');
    expect(text).toContain('Tablet');
    expect(text).toContain('500 mg');
    expect(text).toContain('Seclo');
  });

  it('shows the discount line with its percentage and amount', async () => {
    const text = await renderText(buildSale());

    expect(text).toContain('Discount');
    expect(text).toContain('10.00%');
    expect(text).toContain('30.00');
  });

  it('labels a flat discount without a percent sign', async () => {
    const text = await renderText(
      buildSale({
        discountType: 'flat',
        discountValue: 25,
        discountAmount: 25,
        totalAmount: 275,
      }),
    );

    expect(text).toContain('Discount (flat)');
    expect(text).not.toContain('%)');
  });

  it('omits the discount line entirely when nothing was discounted', async () => {
    const text = await renderText(
      buildSale({
        discountType: null,
        discountValue: null,
        discountAmount: 0,
        totalAmount: 300,
      }),
    );

    expect(text).not.toContain('Discount');
    expect(text).toContain('Subtotal');
    expect(text).toContain('Total');
  });

  it('falls back to an ASCII currency label, since Helvetica cannot draw the Taka sign', async () => {
    // pdfkit encodes U+09F3 with advanceWidth 0 — it would render as nothing.
    const text = await renderText(buildSale());

    expect(text).toContain('BDT 270.00');
  });

  it('renders an item with no strength without a dangling separator', async () => {
    const text = await renderText(buildSale());
    const separator = ''; // em dash in WinAnsi

    // "Napa — Tablet — 500 mg" keeps both separators...
    expect(text).toContain(`Napa ${separator} Tablet ${separator} 500 mg`);
    // ...while the null-strength line stops after the dosage form.
    expect(text).toContain(`Seclo ${separator} Capsule`);
    expect(text).not.toContain(`Capsule ${separator} `);
  });
});
