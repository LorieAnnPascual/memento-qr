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
  width: number;
  height: number;
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
