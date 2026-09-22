import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import PDFDocument from 'pdfkit';
import { formatAmount } from '../../common/money';
import { SettingsService, ShopSettings } from '../settings/settings.service';
import { splitUnitMarker } from './receipt-pdf.service';
import { Sale } from './entities/sale.entity';

/**
 * pdfkit's built-in fonts (Helvetica et al.) are WinAnsi-encoded and have no
 * glyph for the Taka sign — it encodes with advanceWidth 0 and renders as
 * nothing at all, silently. So amounts are labelled `BDT` unless a Unicode font
 * capable of rendering it is supplied via INVOICE_FONT_PATH.
 */
const TAKA_SIGN = '৳';
const ASCII_CURRENCY = 'BDT ';

const PAGE_MARGIN = 50;
const COLUMNS = {
  item: 50,
  qty: 305,
  unitPrice: 380,
  lineTotal: 470,
} as const;
const CONTENT_RIGHT = 545;

@Injectable()
export class InvoicePdfService {
  private readonly logger = new Logger(InvoicePdfService.name);
  private readonly fontPath = process.env.INVOICE_FONT_PATH;
  private readonly customFont: Buffer | null = this.loadCustomFont();

  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Renders the invoice and resolves once the whole PDF is buffered.
   *
   * `compress` defaults to on; turning it off leaves the text readable in the
   * raw content stream, which is how the tests assert on what was drawn.
   */
  async render(
    sale: Sale,
    options: { compress?: boolean } = {},
  ): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      compress: options.compress ?? true,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    if (this.customFont !== null) {
      doc.registerFont('invoice', this.customFont);
      doc.font('invoice');
    }

    const settings = await this.settingsService.getAll();
    this.drawHeader(doc, sale, settings);
    const tableEndY = this.drawItems(doc, sale);
    this.drawTotals(doc, sale, tableEndY);
    this.drawFooter(doc, sale);

    doc.end();
    return finished;
  }

  /** Amounts are prefixed with the Taka sign only when a font can draw it. */
  private money(amount: number): string {
    const prefix = this.customFont === null ? ASCII_CURRENCY : TAKA_SIGN;
    return `${prefix}${formatAmount(amount)}`;
  }

  private loadCustomFont(): Buffer | null {
    if (this.fontPath === undefined || this.fontPath.trim() === '') {
      return null;
    }
    try {
      const font = fs.readFileSync(this.fontPath);
      this.logger.log(`Rendering invoices with font ${this.fontPath}`);
      return font;
    } catch {
      this.logger.warn(
        `INVOICE_FONT_PATH "${this.fontPath}" could not be read; ` +
          'falling back to Helvetica with "BDT" amount labels.',
      );
      return null;
    }
  }

  private drawHeader(
    doc: PDFKit.PDFDocument,
    sale: Sale,
    settings: ShopSettings,
  ): void {
    doc.fontSize(20).text(settings.shop_name || 'Pharmacy', { align: 'center' });
    doc.fontSize(9);
    if (settings.shop_address) doc.text(settings.shop_address, { align: 'center' });
    const contact = [
      settings.shop_phone ? `Phone: ${settings.shop_phone}` : '',
      settings.drug_license_no ? `Drug Licence: ${settings.drug_license_no}` : '',
    ]
      .filter(Boolean)
      .join('   ');
    if (contact) doc.text(contact, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(14).text('INVOICE', { align: 'center' });
    if (sale.status === 'voided') {
      doc.moveDown(0.3);
      doc.fontSize(16).text('VOIDED', { align: 'center' });
    } else if (sale.status === 'returned' || sale.status === 'partial_return') {
      doc.moveDown(0.3);
      doc
        .fontSize(12)
        .text(
          sale.status === 'returned' ? 'FULLY RETURNED' : 'PARTIALLY RETURNED',
          { align: 'center' },
        );
    }
    doc.moveDown(1);

    doc.fontSize(10);
    doc.text(`Invoice number: ${sale.invoiceNumber}`);
    doc.text(`Date: ${formatDateTime(sale.createdAt)}`);
    doc.moveDown(1);
  }

  /** Returns the y position just below the table. */
  private drawItems(doc: PDFKit.PDFDocument, sale: Sale): number {
    const headerY = doc.y;
    doc.fontSize(10);
    doc.text('Item', COLUMNS.item, headerY);
    doc.text('Qty', COLUMNS.qty, headerY, { width: 40, align: 'right' });
    doc.text('Unit price', COLUMNS.unitPrice, headerY, {
      width: 80,
      align: 'right',
    });
    doc.text('Line total', COLUMNS.lineTotal, headerY, {
      width: 75,
      align: 'right',
    });

    let y = headerY + 15;
    doc.moveTo(COLUMNS.item, y).lineTo(CONTENT_RIGHT, y).stroke();
    y += 8;

    for (const item of sale.items) {
      // Rendered from the snapshots, never a live catalogue join, so the
      // invoice keeps showing what was actually sold.
      const { unit, marker } = splitUnitMarker(item.unitNameSnapshot);
      const description =
        [item.brandNameSnapshot, item.dosageFormSnapshot, item.strengthSnapshot]
          .filter((part): part is string => part !== null && part !== '')
          .join(' — ') + (marker ? ` (${marker})` : '');
      const qty = `${item.quantity} ${unit}`;

      // Row height follows the tallest cell, so a wrapped name or unit never
      // runs into the next row.
      const height = Math.max(
        doc.heightOfString(description, { width: 240 }),
        doc.heightOfString(qty, { width: 70 }),
      );
      doc.text(description, COLUMNS.item, y, { width: 240 });
      doc.text(qty, COLUMNS.qty - 15, y, {
        width: 70,
        align: 'right',
      });
      doc.text(this.money(item.unitPrice), COLUMNS.unitPrice, y, {
        width: 80,
        align: 'right',
      });
      doc.text(this.money(item.lineTotal), COLUMNS.lineTotal, y, {
        width: 75,
        align: 'right',
      });

      y += Math.max(height, 12) + 6;
      if (y > 720) {
        doc.addPage();
        y = PAGE_MARGIN;
      }
    }

    doc.moveTo(COLUMNS.item, y).lineTo(CONTENT_RIGHT, y).stroke();
    return y + 10;
  }

  private drawTotals(
    doc: PDFKit.PDFDocument,
    sale: Sale,
    startY: number,
  ): void {
    let y = startY;
    const label = (text: string, value: string, bold = false) => {
      doc.fontSize(bold ? 12 : 10);
      doc.text(text, COLUMNS.unitPrice - 80, y, { width: 160, align: 'right' });
      doc.text(value, COLUMNS.lineTotal, y, { width: 75, align: 'right' });
      y += bold ? 20 : 16;
    };

    label('Subtotal', this.money(sale.subtotal));

    // Omitted entirely when nothing was discounted.
    if (sale.discountType !== null && sale.discountAmount > 0) {
      const descriptor =
        sale.discountType === 'percentage'
          ? `Discount (${formatAmount(sale.discountValue ?? 0)}%)`
          : 'Discount (flat)';
      label(descriptor, `-${this.money(sale.discountAmount)}`);
    }

    label('Total', this.money(sale.totalAmount), true);
    doc.y = y;
  }

  private drawFooter(doc: PDFKit.PDFDocument, sale: Sale): void {
    doc.moveDown(1.5);
    doc.fontSize(10);
    doc.text(`Payment method: ${sale.paymentMethod}`, COLUMNS.item);
    if (sale.paymentMethod === 'due') {
      doc.text(`Due on this invoice: ${this.money(sale.dueAmount)}`);
    }
    if (sale.customer) {
      doc.text(`Customer: ${sale.customer.name}${sale.customer.phone ? ` (${sale.customer.phone})` : ''}`);
    }
    doc.text(`Processed by: ${sale.createdBy?.name || sale.createdBy?.email || 'unknown'}`);
  }
}

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
