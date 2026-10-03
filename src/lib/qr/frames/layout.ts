import type { Rect } from './types';

/**
 * Frame geometry. Everything is measured in "units" where the QR code is exactly 1000
 * wide, so one number describes a frame at any output size.
 *
 * From the middle outwards: the code, a clear plate around it (the quiet zone scanners
 * need), then a ring where a design draws its decoration. A caption sits in a band
 * below the plate. Decoration never goes on the plate: it is painted over the art.
 */
export const QR_UNITS = 1000;

/** Width of the decoration ring around the plate. Kept thin so the code stays at least about 70% of the width. */
export const RING = 90;
/** Where the main border line sits, measured from the image edge. */
export const BORDER_INSET = 36;
/** The standard quiet zone is 4 modules; it never goes below this many units whatever the code's density. */
export const QUIET_MODULES = 4;
const MIN_QUIET = 70;
/** Used when the code's density is not known (a typical short link with a logo). */
export const DEFAULT_MODULES = 33;

const CAPTION_BAND = 190;
const CAPTION_HEIGHT = 100;
const CAPTION_TOP_GAP = 30;

export interface FrameGeometry {
  width: number;
  height: number;
  margin: number;
  inset: number;
  quiet: number;
  plate: Rect;
  qr: Rect;
  /** The full-width area for the caption, or null without one. Designs may use a narrower shape inside it. */
  captionArea: Rect | null;
}

/** `modules` is how many dots wide the code is (21 to 177); it sets how wide the quiet zone must be. */
export function frameGeometry(modules: number | null | undefined, hasCaption: boolean): FrameGeometry {
  const count = modules && modules >= 21 ? modules : DEFAULT_MODULES;
  const quiet = Math.max(MIN_QUIET, Math.round((QUIET_MODULES / count) * QR_UNITS));

  const plateSize = QR_UNITS + quiet * 2;
  const width = plateSize + RING * 2;
  const bottom = hasCaption ? CAPTION_BAND : RING;
  const height = RING + plateSize + bottom;

  const plate: Rect = { x: RING, y: RING, width: plateSize, height: plateSize };
  return {
    width,
    height,
    margin: RING,
    inset: BORDER_INSET,
    quiet,
    plate,
    qr: { x: RING + quiet, y: RING + quiet, width: QR_UNITS, height: QR_UNITS },
    captionArea: hasCaption
      ? { x: plate.x, y: plate.y + plateSize + CAPTION_TOP_GAP, width: plateSize, height: CAPTION_HEIGHT }
      : null,
  };
}

/** The share of the framed picture's width that the code takes (about 0.7 or more). */
export function qrShareOfWidth(geometry: FrameGeometry): number {
  return geometry.qr.width / geometry.width;
}
