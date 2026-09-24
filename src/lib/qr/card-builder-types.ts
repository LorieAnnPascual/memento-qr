import type { CardFontKey } from './card-fonts';

export type ShapeKind = 'rectangle' | 'circle';

interface BaseElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface QRElement extends BaseElement {
  type: 'qr';
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  color: string;
  fontFamily: CardFontKey;
  fontSize: number;
  bold: boolean;
  align: 'left' | 'center' | 'right';
}

export interface ImageElement extends BaseElement {
  type: 'image';
  url: string;
}

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shape: ShapeKind;
  color: string;
  opacity: number;
}

export type CardElement = QRElement | TextElement | ImageElement | ShapeElement;

// `Partial<CardElement>` (a union) only allows the fields common to every
// member. This intersects each member's own Partial so a patch object can
// carry any subset of any member's fields — the builder narrows by
// `element.type` before deciding which fields to set, but the callback
// signature itself needs to accept all of them.
export type CardElementPatch = Partial<QRElement> &
  Partial<TextElement> &
  Partial<ImageElement> &
  Partial<ShapeElement>;

export interface CustomCardDesign {
  /** Canvas size in editor pixels. */
  width: number;
  height: number;
  /** The real printed size, when one was chosen. The pixel size then has the same proportions. */
  sizeMm?: { width: number; height: number };
  /** Bleed to show and print with (mm); only meaningful with `sizeMm`. */
  bleedMm?: number;
  elements: CardElement[];
}

export const CANVAS_PRESETS = {
  vertical: { width: 400, height: 600 },
  horizontal: { width: 600, height: 400 },
} as const;

export function createDefaultCustomCard(
  orientation: keyof typeof CANVAS_PRESETS = 'vertical',
): CustomCardDesign {
  const { width, height } = CANVAS_PRESETS[orientation];
  const qrSize = Math.min(width, height) * 0.5;
  return {
    width,
    height,
    elements: [
      {
        id: 'qr',
        type: 'qr',
        x: (width - qrSize) / 2,
        y: height * 0.15,
        width: qrSize,
        height: qrSize,
        zIndex: 0,
      },
    ],
  };
}

let nextId = 1;
export function generateElementId(): string {
  nextId += 1;
  return `el-${Date.now()}-${nextId}`;
}

/** The longest side of the editing canvas when a real size is chosen. */
export const EDITOR_LONG_SIDE_PX = 600;

/** Canvas pixels for a real size, keeping its proportions. */
export function canvasSizeForMm(
  widthMm: number,
  heightMm: number,
  longSidePx: number = EDITOR_LONG_SIDE_PX,
): { width: number; height: number } {
  const scale = longSidePx / Math.max(widthMm, heightMm);
  return { width: Math.round(widthMm * scale), height: Math.round(heightMm * scale) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Moves a design onto a canvas of another size. Positions follow the canvas;
 * the QR code stays square and keeps its centre; text scales with the smaller
 * side so it stays readable; banners and pictures stretch with the canvas.
 * Nothing is left hanging outside the new canvas.
 */
export function resizeDesign(design: CustomCardDesign, width: number, height: number): CustomCardDesign {
  const sx = width / design.width;
  const sy = height / design.height;
  const uniform = Math.min(sx, sy);

  const elements = design.elements.map((el): CardElement => {
    if (el.type === 'qr') {
      const size = Math.min(el.width * uniform, width, height);
      const centreX = (el.x + el.width / 2) * sx;
      const centreY = (el.y + el.height / 2) * sy;
      return {
        ...el,
        width: size,
        height: size,
        x: clamp(centreX - size / 2, 0, width - size),
        y: clamp(centreY - size / 2, 0, height - size),
      };
    }

    const w = Math.min(el.width * sx, width);
    const h = Math.min(el.height * sy, height);
    const moved = { ...el, width: w, height: h, x: clamp(el.x * sx, 0, width - w), y: clamp(el.y * sy, 0, height - h) };

    if (el.type === 'text') return { ...moved, fontSize: Math.max(6, Math.round(el.fontSize * uniform)) } as CardElement;
    return moved as CardElement;
  });

  return { ...design, width, height, elements };
}
