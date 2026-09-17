import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import PDFDocument from 'pdfkit';
import { formatAmount } from '../../common/money';
import { DuePayment } from '../customers/entities/customer.entity';
import { SettingsService, ShopSettings } from '../settings/settings.service';
import { Sale } from './entities/sale.entity';

const MM = 72 / 25.4;
const TAKA_SIGN = '৳';
const ASCII_CURRENCY = 'Tk ';

/**
 * Narrow receipts for 58 mm / 80 mm thermal printers. One long page whose
 * height is computed after drawing, so the printer cuts right after the
 * footer. Shop identity comes from settings.
 */
@Injectable()
export class ReceiptPdfService {
  private readonly logger = new Logger(ReceiptPdfService.name);
  private readonly customFont: Buffer | null = this.loadCustomFont();

  constructor(private readonly settingsService: SettingsService) {}

  async renderSale(sale: Sale, widthMm?: 58 | 80): Promise<Buffer> {
    const settings = await this.settingsService.getAll();
    const width = widthMm ?? (await this.settingsService.receiptWidthMm());
    return this.render(width, (doc, w) => {
      this.header(doc, settings, w);
      this.line(doc, w);
      this.kv(doc, 'Invoice', sale.invoiceNumber, w);
      this.kv(doc, 'Date', formatDateTime(sale.createdAt), w);
      this.kv(doc, 'Cashier', sale.createdBy?.name || sale.createdBy?.email || '-', w);
      if (sale.customer) {
        this.kv(doc, 'Customer', `${sale.customer.name}${sale.customer.phone ? ` ${sale.customer.phone}` : ''}`, w);
      }
      if (sale.status === 'voided') {
        doc.moveDown(0.3);
        doc.fontSize(11).text('*** VOIDED ***', { align: 'center' });
      }
      this.line(doc, w);

      doc.fontSize(8);
      for (const item of sale.items ?? []) {
        const name = [item.brandNameSnapshot, item.strengthSnapshot]
          .filter((p): p is string => !!p)
          .join(' ');
        doc.text(name, { width: w });
        const qty = `${item.quantity} ${item.unitNameSnapshot} x ${formatAmount(item.unitPrice)}`;
        const y = doc.y;
        doc.text(qty, 0, y, { width: w * 0.65 });
        doc.text(this.money(item.lineTotal), w * 0.6, y, { width: w * 0.4, align: 'right' });
        doc.moveDown(0.2);
      }
      this.line(doc, w);

      this.kv(doc, 'Subtotal', this.money(sale.subtotal), w);
      if (sale.discountAmount > 0) {
        const label =
          sale.discountType === 'percentage'
            ? `Discount ${formatAmount(sale.discountValue ?? 0)}%`
            : 'Discount';
        this.kv(doc, label, `-${this.money(sale.discountAmount)}`, w);
      }
      doc.fontSize(11);
      this.kv(doc, 'TOTAL', this.money(sale.totalAmount), w, true);
      doc.fontSize(8);
      this.kv(doc, 'Paid by', paymentLabel(sale.paymentMethod), w);
      if (sale.paymentMethod === 'cash' && sale.amountTendered !== null) {
        this.kv(doc, 'Tendered', this.money(sale.amountTendered), w);
        this.kv(doc, 'Change', this.money(sale.changeGiven ?? 0), w);
      }
      if (sale.paymentMethod === 'bkash' && sale.bkashTrxId) {
        this.kv(doc, 'bKash TrxID', sale.bkashTrxId, w);
      }
      if (sale.paymentMethod === 'due') {
        this.kv(doc, 'Due on this bill', this.money(sale.dueAmount), w);
        if (sale.customer) {
          this.kv(doc, 'Total due', this.money(sale.customer.dueBalance), w);
        }
      }
      this.footer(doc, settings, w);
    });
  }

  async renderPayment(payment: DuePayment): Promise<Buffer> {
    const settings = await this.settingsService.getAll();
    const width = await this.settingsService.receiptWidthMm();
    return this.render(width, (doc, w) => {
      this.header(doc, settings, w);
      doc.fontSize(10).text('PAYMENT RECEIPT', { align: 'center' });
      this.line(doc, w);
      this.kv(doc, 'Receipt', payment.receiptNumber, w);
      this.kv(doc, 'Date', formatDateTime(payment.createdAt), w);
      this.kv(doc, 'Customer', `${payment.customer.name}${payment.customer.phone ? ` ${payment.customer.phone}` : ''}`, w);
      this.kv(doc, 'Received by', payment.createdBy?.name || payment.createdBy?.email || '-', w);
      this.line(doc, w);
      doc.fontSize(11);
      this.kv(doc, 'PAID', this.money(payment.amount), w, true);
      doc.fontSize(8);
      this.kv(doc, 'By', paymentLabel(payment.method), w);
      if (payment.bkashTrxId) this.kv(doc, 'bKash TrxID', payment.bkashTrxId, w);
      this.kv(doc, 'Balance left', this.money(payment.balanceAfter), w);
      if (payment.note) doc.text(payment.note, { width: w });
      this.footer(doc, settings, w);
    });
  }

  private async render(
    widthMm: 58 | 80,
    draw: (doc: PDFKit.PDFDocument, contentWidth: number) => void,
  ): Promise<Buffer> {
    const pageWidth = widthMm * MM;
    const margin = 3 * MM;
    const contentWidth = pageWidth - margin * 2;
    // Tall enough for any receipt; the reader/printer trims to content.
    const doc = new PDFDocument({
      size: [pageWidth, 2000],
      margins: { top: margin, bottom: margin, left: margin, right: margin },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    if (this.customFont !== null) {
      doc.registerFont('receipt', this.customFont);
      doc.font('receipt');
    }
    draw(doc, contentWidth);
    // Shrink the page to what was drawn so the printer cuts at the footer.
    const usedHeight = doc.y + margin * 2;
    doc.page.height = Math.max(usedHeight, 40 * MM);
    doc.end();
    return finished;
  }

  private header(doc: PDFKit.PDFDocument, s: ShopSettings, w: number): void {
    doc.fontSize(12).text(s.shop_name || 'Pharmacy', { align: 'center', width: w });
    doc.fontSize(7);
    if (s.shop_address) doc.text(s.shop_address, { align: 'center', width: w });
    if (s.shop_phone) doc.text(`Phone: ${s.shop_phone}`, { align: 'center', width: w });
    if (s.drug_license_no) doc.text(`Drug Licence: ${s.drug_license_no}`, { align: 'center', width: w });
    doc.moveDown(0.3);
  }

  private footer(doc: PDFKit.PDFDocument, s: ShopSettings, w: number): void {
    this.line(doc, w);
    doc.fontSize(7);
    if (s.receipt_footer) doc.text(s.receipt_footer, { align: 'center', width: w });
    doc.moveDown(0.5);
  }

  private kv(doc: PDFKit.PDFDocument, key: string, value: string, w: number, bold = false): void {
    const y = doc.y;
    doc.text(key, 0, y, { width: w * 0.5 });
    doc.text(value, w * 0.5, y, { width: w * 0.5, align: 'right' });
    if (bold) doc.moveDown(0.2);
  }

  private line(doc: PDFKit.PDFDocument, w: number): void {
    doc.moveDown(0.2);
    const y = doc.y;
    doc.moveTo(0, y).lineTo(w, y).dash(1, { space: 1 }).stroke().undash();
    doc.y = y + 4;
    doc.x = 0;
  }

  private money(amount: number): string {
    const prefix = this.customFont === null ? ASCII_CURRENCY : TAKA_SIGN;
    return `${prefix}${formatAmount(amount)}`;
  }

  private loadCustomFont(): Buffer | null {
    const fontPath = process.env.INVOICE_FONT_PATH;
    if (!fontPath || fontPath.trim() === '') return null;
    try {
      return fs.readFileSync(fontPath);
    } catch {
      this.logger.warn(`INVOICE_FONT_PATH "${fontPath}" could not be read for receipts.`);
      return null;
    }
  }
}

function paymentLabel(method: string): string {
  switch (method) {
    case 'bkash':
      return 'bKash';
    case 'due':
      return 'Due (pay later)';
    default:
      return 'Cash';
  }
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
