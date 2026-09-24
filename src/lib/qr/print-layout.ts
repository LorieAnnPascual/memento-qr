/** Print sizes and page geometry. Everything here is in millimetres unless a name says otherwise. */

export const MM_PER_INCH = 25.4;
export const POINTS_PER_INCH = 72;
export const PRINT_DPI = 300;

export type Unit = 'mm' | 'in';

export interface PrintPreset {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
}

export const PRINT_PRESETS: PrintPreset[] = [
  { id: 'business-us', label: 'Business card, US (3.5 × 2 in)', widthMm: 88.9, heightMm: 50.8 },
  { id: 'business-eu', label: 'Business card, EU (85 × 55 mm)', widthMm: 85, heightMm: 55 },
  { id: 'postcard-4x6', label: 'Postcard (6 × 4 in)', widthMm: 152.4, heightMm: 101.6 },
  { id: 'postcard-a6', label: 'Postcard A6 (148 × 105 mm)', widthMm: 148, heightMm: 105 },
  { id: 'square-70', label: 'Square (70 × 70 mm)', widthMm: 70, heightMm: 70 },
];

export const CUSTOM_PRESET_ID = 'custom';

export const DEFAULT_BLEED_MM = 3;
/** Free paper outside the bleed where crop marks are drawn. */
export const CROP_MARGIN_MM = 8;
const CROP_MARK_LENGTH_MM = 4;
const CROP_MARK_GAP_MM = 1;

export const MIN_SIZE_MM = 20;
export const MAX_SIZE_MM = 500;

export function toMm(value: number, unit: Unit): number {
  return unit === 'in' ? value * MM_PER_INCH : value;
}

export function fromMm(valueMm: number, unit: Unit): number {
  return unit === 'in' ? valueMm / MM_PER_INCH : valueMm;
}

export function mmToPoints(mm: number): number {
  return (mm / MM_PER_INCH) * POINTS_PER_INCH;
}

export function mmToPixels(mm: number, dpi: number = PRINT_DPI): number {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

/** True for a usable card dimension. */
export function isValidSizeMm(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_SIZE_MM && value <= MAX_SIZE_MM;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PrintLayout {
  pageWidthMm: number;
  pageHeightMm: number;
  /** Offset of the bleed area from the page edge (room for crop marks). */
  marginMm: number;
  /** The final cut size, positioned on the page. Origin is the page's top-left. */
  trim: Rect;
  /** The trim plus bleed on every side; artwork must reach this edge. */
  bleed: Rect;
  /** Crop mark segments, in the same top-left coordinates. */
  cropMarks: Line[];
}

interface LayoutInput {
  widthMm: number;
  heightMm: number;
  bleedMm: number;
  cropMarks: boolean;
}

/** Where the trim, the bleed and the crop marks go on the printed page. */
export function computePrintLayout(input: LayoutInput): PrintLayout {
  const bleedMm = Math.max(0, input.bleedMm);
  const marginMm = input.cropMarks ? CROP_MARGIN_MM : 0;
  const offset = marginMm + bleedMm;

  const trim: Rect = { x: offset, y: offset, width: input.widthMm, height: input.heightMm };
  const bleed: Rect = { x: marginMm, y: marginMm, width: input.widthMm + bleedMm * 2, height: input.heightMm + bleedMm * 2 };

  const pageWidthMm = bleed.width + marginMm * 2;
  const pageHeightMm = bleed.height + marginMm * 2;

  const cropMarks: Line[] = [];
  if (input.cropMarks) {
    // Marks start a little away from the trim corner (and never inside the bleed) and run outward.
    const start = Math.max(bleedMm, 0) + CROP_MARK_GAP_MM;
    const end = start + CROP_MARK_LENGTH_MM;
    const left = trim.x;
    const right = trim.x + trim.width;
    const top = trim.y;
    const bottom = trim.y + trim.height;

    for (const x of [left, right]) {
      cropMarks.push({ x1: x, y1: top - start, x2: x, y2: top - end }); // above
      cropMarks.push({ x1: x, y1: bottom + start, x2: x, y2: bottom + end }); // below
    }
    for (const y of [top, bottom]) {
      cropMarks.push({ x1: left - start, y1: y, x2: left - end, y2: y }); // left
      cropMarks.push({ x1: right + start, y1: y, x2: right + end, y2: y }); // right
    }
  }

  return { pageWidthMm, pageHeightMm, marginMm, trim, bleed, cropMarks };
}

/**
 * How many millimetres each pixel of a card image covers when the image is
 * scaled to fill (cover) an area of the given size. The larger of the two
 * ratios is used because "cover" scales until both sides are filled.
 */
export function mmPerPixelCover(imageWidthPx: number, imageHeightPx: number, areaWidthMm: number, areaHeightMm: number): number {
  return Math.max(areaWidthMm / imageWidthPx, areaHeightMm / imageHeightPx);
}

/** The share of the card image that is cut off to fill an area of a different shape (0 to 1). */
export function croppedShare(imageWidthPx: number, imageHeightPx: number, areaWidthMm: number, areaHeightMm: number): number {
  const imageAspect = imageWidthPx / imageHeightPx;
  const areaAspect = areaWidthMm / areaHeightMm;
  if (Math.abs(imageAspect - areaAspect) < 1e-6) return 0;
  return imageAspect > areaAspect ? 1 - areaAspect / imageAspect : 1 - imageAspect / areaAspect;
}

/** Physical width of the QR on paper, from where it sits in the card image. */
export function qrPhysicalWidthMm(qrWidthPx: number, imageWidthPx: number, imageHeightPx: number, areaWidthMm: number, areaHeightMm: number): number {
  return qrWidthPx * mmPerPixelCover(imageWidthPx, imageHeightPx, areaWidthMm, areaHeightMm);
}
