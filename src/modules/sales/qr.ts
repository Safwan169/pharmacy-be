import * as QRCode from 'qrcode';

/**
 * Draws a QR code as filled rectangles rather than an image.
 *
 * A thermal printer renders a handful of crisp black boxes far better than a
 * scaled bitmap, and drawing them keeps the PDF small. Runs of dark modules in
 * a row are merged into one rectangle, which also closes the hairline gaps
 * that otherwise appear between neighbouring squares on cheap printers.
 */
export function drawQr(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  size: number,
): void {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const count = qr.modules.size;
  const data = qr.modules.data;
  const module = size / count;

  doc.save().fillColor('black');
  for (let row = 0; row < count; row += 1) {
    let runStart: number | null = null;
    for (let col = 0; col <= count; col += 1) {
      const dark = col < count && data[row * count + col] === 1;
      if (dark && runStart === null) {
        runStart = col;
      } else if (!dark && runStart !== null) {
        doc.rect(
          x + runStart * module,
          y + row * module,
          (col - runStart) * module,
          module,
        );
        runStart = null;
      }
    }
  }
  doc.fill().restore();
}
