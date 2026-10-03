import { escapeXml } from '../card-export-utils';
import { cssFontFamily, type CardFontKey } from '../card-fonts';
import { mixHex, readableOn, relativeLuminance, safeHex } from './color';
import { resolveFrame, type ResolvedFrame } from './config';
import { frameGeometry, QR_UNITS, type FrameGeometry } from './layout';
import type { FrameRenderContext, Rect } from './types';

export interface FramedSvgOptions {
  /** The frame to draw (a `FrameConfig`; unknown values give null). */
  frame: unknown;
  /** How many dots wide the code is; sets the quiet zone. Read it from the QR with `qrModuleCount`. */
  modules?: number | null;
  /** The light colour behind and around the code. White unless the code's own background is a plain opaque colour. */
  plateColor?: string;
  /** Leave the caption text out (the browser draws it itself so it can use the app's fonts). Default true. */
  includeCaption?: boolean;
  /** Prefix for the ids inside the code's markup, so several framed codes can share one page. */
  idPrefix?: string;
  /** Width of the picture in pixels (default 1000); the height follows. */
  width?: number;
  /** Alternatively, how many pixels wide the code itself should be; the picture is sized to match. Wins over `width`. */
  qrPixels?: number;
  /** Draw the frame and the plate but leave the code out (the browser paints a crisp raster of the code on top). */
  omitQr?: boolean;
}

export interface CaptionPlacement {
  text: string;
  /** Centre of the text, baseline position, and size, all in picture pixels. */
  x: number;
  baselineY: number;
  fontSize: number;
  /** Width the text must stay within, in pixels. */
  maxWidth: number;
  color: string;
  fontKey: CardFontKey;
  weight: number;
  italic: boolean;
}

export interface FramedSvg {
  svg: string;
  /** Picture size in pixels. */
  width: number;
  height: number;
  /** Pixels per frame unit. */
  scale: number;
  /** Where the code sits, in pixels. */
  qrRect: Rect;
  /** The clear plate round the code (code plus quiet zone), in pixels. */
  plateRect: Rect;
  /** The caption, or null without one. */
  caption: CaptionPlacement | null;
  /** The design's id, for callers that want to label things. */
  frameId: string;
  geometry: FrameGeometry;
}

/** Pulls the viewBox and the inner markup out of the SVG text qr-code-styling produces. */
function parseQrSvg(text: string): { viewBox: string; inner: string } {
  const match = /<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i.exec(text.trim());
  if (!match) throw new Error('The QR code is not valid SVG');

  const attributes = match[1];
  const viewBox = /\bviewBox="([^"]+)"/i.exec(attributes)?.[1];
  const width = /\bwidth="([\d.]+)/i.exec(attributes)?.[1];
  const height = /\bheight="([\d.]+)/i.exec(attributes)?.[1];

  return { viewBox: viewBox ?? `0 0 ${width ?? 1000} ${height ?? width ?? 1000}`, inner: match[2] };
}

/** Gives every id (and each reference to it) a prefix, so two inline SVGs on one page cannot clash. */
export function prefixIds(markup: string, prefix: string): string {
  return markup
    .replace(/\bid="([^"]+)"/g, (_m, id: string) => `id="${prefix}-${id}"`)
    .replace(/url\((['"]?)#([^)'"]+)\1\)/g, (_m, quote: string, id: string) => `url(${quote}#${prefix}-${id}${quote})`)
    .replace(/\b((?:xlink:)?href)="#([^"]+)"/g, (_m, attr: string, id: string) => `${attr}="#${prefix}-${id}"`);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

function captionColor(resolved: ResolvedFrame, paper: string): string {
  const { on } = resolved.definition.caption;
  if (on === 'primary') return readableOn(resolved.primary);
  if (on === 'accent') return readableOn(resolved.accent);
  return contrast(resolved.primary, paper) >= 3 ? resolved.primary : readableOn(paper);
}

/** The caption's size, chosen so it fits its shape without anyone measuring the text. */
export function captionFontSize(resolved: ResolvedFrame, shapeWidth: number): number {
  const { charWidth, maxSize } = resolved.definition.caption;
  const length = Math.max(1, Array.from(resolved.caption).length);
  return Math.min(maxSize, (shapeWidth * 0.88) / (length * charWidth));
}

/** The colour a code's plate (quiet zone) should be: the code's own background when plain and opaque, otherwise white. */
export function plateColorFor(style: {
  backgroundColor?: string;
  backgroundOpacity?: number;
  backgroundGradient?: unknown;
}): string {
  if (style.backgroundGradient) return '#ffffff';
  if (style.backgroundOpacity !== undefined && style.backgroundOpacity < 100) return '#ffffff';
  return safeHex(style.backgroundColor, '#ffffff');
}

/**
 * Puts a finished QR code (SVG text from qr-code-styling) inside a decorative frame and
 * returns the framed SVG. Pure: the same inputs always give the same markup.
 *
 * The code is placed last-but-one, on top of everything except the caption, on a clear plate
 * painted over the design's art. So no decoration can ever cover a dot or intrude on the
 * quiet zone, whatever a design draws.
 */
export function buildFramedSvg(qrSvg: string, options: FramedSvgOptions): FramedSvg | null {
  const resolved = resolveFrame(options.frame);
  if (!resolved) return null;

  const { definition } = resolved;
  const hasCaption = resolved.caption.length > 0;
  const geometry = frameGeometry(options.modules, hasCaption);
  const plateColor = safeHex(options.plateColor, '#ffffff');
  const paper = safeHex(definition.paper?.({ primary: resolved.primary, accent: resolved.accent }), '#ffffff');

  const factor = definition.caption.widthFactor;
  const area = geometry.captionArea;
  const captionBox: Rect | null = area
    ? { x: area.x + (area.width * (1 - factor)) / 2, y: area.y, width: area.width * factor, height: area.height }
    : null;

  const context: FrameRenderContext = {
    width: geometry.width,
    height: geometry.height,
    margin: geometry.margin,
    inset: geometry.inset,
    plate: geometry.plate,
    qr: geometry.qr,
    captionBox,
    primary: resolved.primary,
    accent: resolved.accent,
    paper,
  };

  const parsed = options.omitQr ? null : parseQrSvg(qrSvg);
  const prefix = (options.idPrefix ?? 'mqf').replace(/[^a-z0-9-]/gi, '') || 'mqf';

  const pixelWidth = Math.max(
    1,
    Math.round(options.qrPixels ? (geometry.width * options.qrPixels) / QR_UNITS : (options.width ?? 1000)),
  );
  const scale = pixelWidth / geometry.width;
  const pixelHeight = Math.round(geometry.height * scale);

  const { plate, qr } = geometry;
  const plateRadius = Math.round(Math.min(geometry.quiet * 0.6, 60));
  const plateEdge = mixHex(resolved.primary, plateColor, 0.78);

  let caption: CaptionPlacement | null = null;
  let captionMarkup = '';
  if (captionBox) {
    const fontSize = captionFontSize(resolved, captionBox.width);
    const style = definition.caption;
    const text = style.uppercase ? resolved.caption.toUpperCase() : resolved.caption;
    const color = captionColor(resolved, paper);
    const baseline = captionBox.y + captionBox.height / 2 + fontSize * 0.34;
    caption = {
      text,
      x: (captionBox.x + captionBox.width / 2) * scale,
      baselineY: baseline * scale,
      fontSize: fontSize * scale,
      maxWidth: captionBox.width * 0.9 * scale,
      color,
      fontKey: style.font,
      weight: style.weight,
      italic: Boolean(style.italic),
    };
    captionMarkup = `<text x="${captionBox.x + captionBox.width / 2}" y="${Math.round(baseline * 10) / 10}" text-anchor="middle" font-family="${cssFontFamily(style.font)}" font-weight="${style.weight}"${style.italic ? ' font-style="italic"' : ''} font-size="${Math.round(fontSize * 10) / 10}" fill="${color}">${escapeXml(text)}</text>`;
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${pixelWidth}" height="${pixelHeight}" viewBox="0 0 ${geometry.width} ${geometry.height}" data-frame="${definition.id}">` +
    `<rect width="${geometry.width}" height="${geometry.height}" fill="${paper}"/>` +
    `<g data-part="art" data-frame="${definition.id}">${definition.render(context)}</g>` +
    `<rect data-part="plate" x="${plate.x}" y="${plate.y}" width="${plate.width}" height="${plate.height}" rx="${plateRadius}" fill="${plateColor}" stroke="${plateEdge}" stroke-width="3"/>` +
    (parsed
      ? `<svg data-part="qr" x="${qr.x}" y="${qr.y}" width="${qr.width}" height="${qr.height}" viewBox="${parsed.viewBox}" preserveAspectRatio="xMidYMid meet">${prefixIds(parsed.inner, prefix)}</svg>`
      : '') +
    (options.includeCaption === false ? '' : captionMarkup) +
    `</svg>`;

  return {
    svg,
    width: pixelWidth,
    height: pixelHeight,
    scale,
    qrRect: { x: qr.x * scale, y: qr.y * scale, width: qr.width * scale, height: qr.height * scale },
    plateRect: { x: plate.x * scale, y: plate.y * scale, width: plate.width * scale, height: plate.height * scale },
    caption,
    frameId: definition.id,
    geometry,
  };
}
