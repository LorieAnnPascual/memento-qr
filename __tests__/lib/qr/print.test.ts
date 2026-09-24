import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';

import {
  computePrintLayout,
  croppedShare,
  CROP_MARGIN_MM,
  fromMm,
  isValidSizeMm,
  mmPerPixelCover,
  mmToPixels,
  mmToPoints,
  PRINT_PRESETS,
  qrPhysicalWidthMm,
  toMm,
} from '@/lib/qr/print-layout';
import { buildPrintPdf } from '@/lib/qr/print-pdf';

// A valid 2x2 white PNG.
const PNG_2X2 = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGP8//8/AxJgHFUEAAqTBgGOo/A0AAAAAElFTkSuQmCC'),
  (c) => c.charCodeAt(0),
);

describe('unit conversion', () => {
  it('converts between inches and millimetres', () => {
    expect(toMm(3.5, 'in')).toBeCloseTo(88.9, 5);
    expect(toMm(90, 'mm')).toBe(90);
    expect(fromMm(88.9, 'in')).toBeCloseTo(3.5, 5);
    expect(fromMm(90, 'mm')).toBe(90);
  });

  it('converts millimetres to PDF points (72 per inch) and to pixels at 300 dpi', () => {
    expect(mmToPoints(25.4)).toBeCloseTo(72, 5);
    expect(mmToPixels(25.4)).toBe(300);
    expect(mmToPixels(88.9)).toBe(1050);
  });
});

describe('presets', () => {
  it('offers business cards and postcards with sensible sizes', () => {
    const byId = Object.fromEntries(PRINT_PRESETS.map((p) => [p.id, p]));

    expect(byId['business-us']).toMatchObject({ widthMm: 88.9, heightMm: 50.8 });
    expect(byId['business-eu']).toMatchObject({ widthMm: 85, heightMm: 55 });
    expect(byId['postcard-4x6']).toMatchObject({ widthMm: 152.4, heightMm: 101.6 });
    expect(byId['postcard-a6']).toMatchObject({ widthMm: 148, heightMm: 105 });
  });

  it('has unique ids', () => {
    expect(new Set(PRINT_PRESETS.map((p) => p.id)).size).toBe(PRINT_PRESETS.length);
  });
});

describe('isValidSizeMm', () => {
  it('accepts normal card sizes and refuses tiny, huge and non-numbers', () => {
    expect(isValidSizeMm(85)).toBe(true);
    expect(isValidSizeMm(20)).toBe(true);
    expect(isValidSizeMm(500)).toBe(true);
    expect(isValidSizeMm(19.9)).toBe(false);
    expect(isValidSizeMm(501)).toBe(false);
    expect(isValidSizeMm(Number.NaN)).toBe(false);
    expect(isValidSizeMm(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidSizeMm(-50)).toBe(false);
  });
});

describe('computePrintLayout', () => {
  it('is just the card when there is no bleed and no marks', () => {
    const layout = computePrintLayout({ widthMm: 90, heightMm: 50, bleedMm: 0, cropMarks: false });

    expect(layout.pageWidthMm).toBe(90);
    expect(layout.pageHeightMm).toBe(50);
    expect(layout.trim).toEqual({ x: 0, y: 0, width: 90, height: 50 });
    expect(layout.cropMarks).toEqual([]);
  });

  it('adds the bleed on every side around the trim', () => {
    const layout = computePrintLayout({ widthMm: 90, heightMm: 50, bleedMm: 3, cropMarks: false });

    expect(layout.bleed).toEqual({ x: 0, y: 0, width: 96, height: 56 });
    expect(layout.trim).toEqual({ x: 3, y: 3, width: 90, height: 50 });
    expect(layout.pageWidthMm).toBe(96);
  });

  it('makes room outside the bleed for crop marks', () => {
    const layout = computePrintLayout({ widthMm: 90, heightMm: 50, bleedMm: 3, cropMarks: true });

    expect(layout.marginMm).toBe(CROP_MARGIN_MM);
    expect(layout.pageWidthMm).toBe(96 + CROP_MARGIN_MM * 2);
    expect(layout.pageHeightMm).toBe(56 + CROP_MARGIN_MM * 2);
    expect(layout.trim.x).toBe(CROP_MARGIN_MM + 3);
  });

  it('draws 8 crop marks: two at each corner, none inside the bleed and all on the page', () => {
    const layout = computePrintLayout({ widthMm: 90, heightMm: 50, bleedMm: 3, cropMarks: true });

    expect(layout.cropMarks).toHaveLength(8);
    const { trim, bleed } = layout;
    for (const mark of layout.cropMarks) {
      for (const [x, y] of [[mark.x1, mark.y1], [mark.x2, mark.y2]] as const) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(layout.pageWidthMm);
        expect(y).toBeLessThanOrEqual(layout.pageHeightMm);
        const insideBleed = x > bleed.x && x < bleed.x + bleed.width && y > bleed.y && y < bleed.y + bleed.height;
        expect(insideBleed).toBe(false);
      }
      // Every mark lines up with a trim edge (it is horizontal or vertical along one).
      const vertical = mark.x1 === mark.x2 && [trim.x, trim.x + trim.width].includes(mark.x1);
      const horizontal = mark.y1 === mark.y2 && [trim.y, trim.y + trim.height].includes(mark.y1);
      expect(vertical || horizontal).toBe(true);
    }
  });

  it('treats a negative bleed as none', () => {
    expect(computePrintLayout({ widthMm: 90, heightMm: 50, bleedMm: -5, cropMarks: false }).bleed.width).toBe(90);
  });
});

describe('fitting the card into a shape', () => {
  it('finds how many millimetres each pixel covers', () => {
    expect(mmPerPixelCover(1000, 500, 100, 50)).toBeCloseTo(0.1, 6);
    // A taller area than the image: the height decides, so the image is cropped at the sides.
    expect(mmPerPixelCover(1000, 500, 100, 100)).toBeCloseTo(0.2, 6);
  });

  it('reports no cropping when the shapes match, and the cropped share when they differ', () => {
    expect(croppedShare(1000, 500, 90, 45)).toBe(0);
    expect(croppedShare(1000, 500, 100, 100)).toBeCloseTo(0.5, 6); // wide image, square area: half cut off
    expect(croppedShare(500, 1000, 100, 100)).toBeCloseTo(0.5, 6);
  });

  it('works out how wide the QR is on paper', () => {
    // QR is 400 of the image\'s 1000 px; the image fills 100 mm, so the QR is 40 mm.
    expect(qrPhysicalWidthMm(400, 1000, 500, 100, 50)).toBeCloseTo(40, 6);
  });
});

describe('buildPrintPdf', () => {
  it('makes a one-page PDF the size of trim + bleed + marks, with trim and bleed boxes', async () => {
    const layout = computePrintLayout({ widthMm: 90, heightMm: 50, bleedMm: 3, cropMarks: true });

    const bytes = await buildPrintPdf(PNG_2X2, layout, 'Menu card');
    const pdf = await PDFDocument.load(bytes);

    expect(pdf.getPageCount()).toBe(1);
    const page = pdf.getPage(0);
    expect(page.getWidth()).toBeCloseTo(mmToPoints(layout.pageWidthMm), 2);
    expect(page.getHeight()).toBeCloseTo(mmToPoints(layout.pageHeightMm), 2);

    const trim = page.getTrimBox();
    expect(trim.width).toBeCloseTo(mmToPoints(90), 2);
    expect(trim.height).toBeCloseTo(mmToPoints(50), 2);
    const bleed = page.getBleedBox();
    expect(bleed.width).toBeCloseTo(mmToPoints(96), 2);
    expect(pdf.getTitle()).toBe('Menu card');
  });

  it('is exactly the card size when there is no bleed or marks', async () => {
    const layout = computePrintLayout({ widthMm: 88.9, heightMm: 50.8, bleedMm: 0, cropMarks: false });

    const pdf = await PDFDocument.load(await buildPrintPdf(PNG_2X2, layout, 'x'));

    expect(pdf.getPage(0).getWidth()).toBeCloseTo(252, 0); // 3.5 in x 72
    expect(pdf.getPage(0).getHeight()).toBeCloseTo(144, 0); // 2 in x 72
  });

  it('draws the crop marks only when asked', async () => {
    const withMarks = await buildPrintPdf(PNG_2X2, computePrintLayout({ widthMm: 90, heightMm: 50, bleedMm: 3, cropMarks: true }), 'x');
    const without = await buildPrintPdf(PNG_2X2, computePrintLayout({ widthMm: 90, heightMm: 50, bleedMm: 3, cropMarks: false }), 'x');

    // 8 marks means noticeably more page content than none.
    expect(withMarks.length).toBeGreaterThan(without.length);
  });

  it('refuses artwork that is not a PNG', async () => {
    const layout = computePrintLayout({ widthMm: 90, heightMm: 50, bleedMm: 0, cropMarks: false });

    await expect(buildPrintPdf(new Uint8Array([1, 2, 3]), layout, 'x')).rejects.toThrow();
  });
});
