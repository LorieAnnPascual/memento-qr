import { PDFDocument, rgb } from 'pdf-lib';

import { mmToPoints, type PrintLayout } from './print-layout';

/**
 * Puts the finished card artwork on a PDF page of the right physical size.
 * `artworkPng` covers the bleed area (trim plus bleed); crop marks are drawn
 * outside it, and the PDF records the trim and bleed boxes so a print shop's
 * software knows where the card will be cut.
 */
export async function buildPrintPdf(artworkPng: Uint8Array, layout: PrintLayout, title: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator('Memento QR');

  const pageWidth = mmToPoints(layout.pageWidthMm);
  const pageHeight = mmToPoints(layout.pageHeightMm);
  const page = pdf.addPage([pageWidth, pageHeight]);

  // Layout coordinates start at the top-left; PDF coordinates start at the bottom-left.
  const pdfY = (yMm: number): number => pageHeight - mmToPoints(yMm);

  const image = await pdf.embedPng(artworkPng);
  page.drawImage(image, {
    x: mmToPoints(layout.bleed.x),
    y: pdfY(layout.bleed.y + layout.bleed.height),
    width: mmToPoints(layout.bleed.width),
    height: mmToPoints(layout.bleed.height),
  });

  for (const mark of layout.cropMarks) {
    page.drawLine({
      start: { x: mmToPoints(mark.x1), y: pdfY(mark.y1) },
      end: { x: mmToPoints(mark.x2), y: pdfY(mark.y2) },
      thickness: 0.25,
      color: rgb(0, 0, 0),
    });
  }

  page.setBleedBox(
    mmToPoints(layout.bleed.x),
    pdfY(layout.bleed.y + layout.bleed.height),
    mmToPoints(layout.bleed.width),
    mmToPoints(layout.bleed.height),
  );
  page.setTrimBox(
    mmToPoints(layout.trim.x),
    pdfY(layout.trim.y + layout.trim.height),
    mmToPoints(layout.trim.width),
    mmToPoints(layout.trim.height),
  );

  return pdf.save();
}
