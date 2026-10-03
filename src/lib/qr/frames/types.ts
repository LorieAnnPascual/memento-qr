import type { CardFontKey } from '../card-fonts';

/** A rectangle in frame units (the QR code is always 1000 units wide, see layout.ts). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Groups designs in the picker. */
export type FrameOccasion = 'everyday' | 'celebration' | 'remembrance' | 'pets';

/** How a design's caption is set. The shape behind it is drawn by the design itself. */
export interface CaptionStyle {
  font: CardFontKey;
  weight: number;
  italic?: boolean;
  uppercase?: boolean;
  /** What the caption sits on: the text colour is chosen to stay readable on it. */
  on: 'primary' | 'accent' | 'paper';
  /** Average glyph width as a share of the font size, to fit the text without measuring it. */
  charWidth: number;
  maxSize: number;
  /** Width of the caption shape as a share of the area below the code (0 to 1). */
  widthFactor: number;
}

/** What a design is given to draw with. Everything is in frame units. */
export interface FrameRenderContext {
  width: number;
  height: number;
  /** Width of the ring between the image edge and the clear area around the code. */
  margin: number;
  /** Distance of the main border line from the image edge. */
  inset: number;
  /** The clear light area around the code (quiet zone included). Drawn on top of the art, so art can never reach it. */
  plate: Rect;
  /** Where the code sits. */
  qr: Rect;
  /** The shape the caption sits on, or null when the caption is switched off. */
  captionBox: Rect | null;
  primary: string;
  accent: string;
  /** The picture's background colour. */
  paper: string;
}

export interface FrameDefinition<Id extends string = string> {
  id: Id;
  label: string;
  description: string;
  occasion: FrameOccasion;
  defaultColor: string;
  defaultAccent: string;
  /** Shown until someone edits the caption; an empty caption means none. */
  defaultCaption: string;
  caption: CaptionStyle;
  /** Background colour of the whole picture. White when omitted. */
  paper?: (colors: { primary: string; accent: string }) => string;
  /** Returns SVG markup for the decoration (no code, no caption text). */
  render: (context: FrameRenderContext) => string;
}

/** Keeps the literal `id` type so the list of designs can derive `FrameId`. */
export function defineFrame<const Id extends string>(definition: FrameDefinition<Id>): FrameDefinition<Id> {
  return definition;
}
