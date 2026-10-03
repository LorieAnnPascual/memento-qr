import type QRCodeStyling from 'qr-code-styling';
import type { FileExtension } from 'qr-code-styling';

import { downloadBlob, getQrPngImage, loadImage } from '../card-export-utils';
import { cssFontFamily } from '../card-fonts';
import type { QRDesignConfig } from '../generator';
import { buildFramedSvg, plateColorFor, type CaptionPlacement, type FramedSvg } from './build';
import { resolveFrame } from './config';
import type { Rect } from './types';

/** The parts of a code's design a frame needs. */
export type FrameSource = Pick<QRDesignConfig, 'frame' | 'backgroundColor' | 'backgroundOpacity' | 'backgroundGradient'>;

/** How many dots wide the code is, read from the QR engine (null if it cannot be told). */
export function qrModuleCount(qr: QRCodeStyling): number | null {
  try {
    return qr._qr?.getModuleCount() ?? null;
  } catch {
    return null;
  }
}

/** True when the design has a frame that is known (an unknown id is treated as no frame). */
export function hasFrame(source: Pick<FrameSource, 'frame'>): boolean {
  return resolveFrame(source.frame) !== null;
}

interface FramedSvgSettings {
  width?: number;
  qrPixels?: number;
  includeCaption?: boolean;
  idPrefix?: string;
}

/** Frames a QR code made by `createQRCode`. Returns null when the design has no frame. */
export async function framedSvgFor(
  qr: QRCodeStyling,
  source: FrameSource,
  settings: FramedSvgSettings = {},
): Promise<FramedSvg | null> {
  if (!hasFrame(source)) return null;

  const blob = await qr.getRawData('svg');
  if (!blob || !(blob instanceof Blob)) throw new Error('Failed to render QR code SVG');

  return buildFramedSvg(await blob.text(), {
    frame: source.frame,
    modules: qrModuleCount(qr),
    plateColor: plateColorFor(source),
    ...settings,
  });
}

async function drawCaption(context: CanvasRenderingContext2D, caption: CaptionPlacement): Promise<void> {
  const font = (size: number): string =>
    `${caption.italic ? 'italic ' : ''}${caption.weight} ${size}px ${cssFontFamily(caption.fontKey)}`;

  // The app's fonts are loaded into the page, but a canvas does not wait for them.
  await document.fonts.load(font(caption.fontSize), caption.text);

  let size = caption.fontSize;
  context.font = font(size);
  const measured = context.measureText(caption.text).width;
  if (measured > caption.maxWidth) {
    size *= caption.maxWidth / measured;
    context.font = font(size);
  }
  context.fillStyle = caption.color;
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  context.fillText(caption.text, caption.x, caption.baselineY);
  context.textAlign = 'left';
}

/**
 * Draws a framed picture on a canvas. The artwork goes through the SVG renderer; the caption is
 * drawn afterwards on the canvas itself, because an SVG used as an image cannot see the page's fonts.
 * Build `framed` with `includeCaption: false` for this.
 */
export async function drawFramedCanvas(framed: FramedSvg, qrImage?: HTMLImageElement): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = framed.width;
  canvas.height = framed.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not supported in this browser');

  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(framed.svg)}`);
  context.drawImage(image, 0, 0, framed.width, framed.height);
  if (qrImage) {
    // The code is painted from the QR engine's own raster, which has no hairline seams between dots.
    const { x, y, width, height } = framed.qrRect;
    context.imageSmoothingQuality = 'high';
    context.drawImage(qrImage, Math.round(x), Math.round(y), Math.round(width), Math.round(height));
  }
  if (framed.caption) await drawCaption(context, framed.caption);
  return canvas;
}

export interface FramedRaster {
  canvas: HTMLCanvasElement;
  /** Where the code sits in the canvas, in pixels. */
  qrRect: Rect;
  /** The clear plate round the code (code plus quiet zone), in pixels. */
  plateRect: Rect;
}

/** A raster of the framed code in which the code itself is `qrPixels` wide. Null when there is no frame. */
export async function renderFramedRaster(
  qr: QRCodeStyling,
  source: FrameSource,
  qrPixels: number,
): Promise<FramedRaster | null> {
  if (!hasFrame(source)) return null;

  // Frame and plate as artwork without the code; the code is a separate raster laid on top (see drawFramedCanvas).
  const framed = buildFramedSvg('', {
    frame: source.frame,
    modules: qrModuleCount(qr),
    plateColor: plateColorFor(source),
    qrPixels,
    includeCaption: false,
    omitQr: true,
  });
  if (!framed) return null;
  return { canvas: await drawFramedCanvas(framed, await getQrPngImage(qr)), qrRect: framed.qrRect, plateRect: framed.plateRect };
}

/**
 * Downloads a framed code (no card layout) in the chosen format. The SVG is the framed artwork
 * itself; the other formats are drawn from it. `qrPixels` is how wide the code is in the file.
 * Returns false when the design has no frame, so the caller can export the plain code instead.
 */
export async function exportFramedQr(
  qr: QRCodeStyling,
  source: FrameSource,
  extension: FileExtension,
  fileName: string,
  qrPixels: number,
): Promise<boolean> {
  if (!hasFrame(source)) return false;

  if (extension === 'svg') {
    const framed = await framedSvgFor(qr, source, { qrPixels });
    if (!framed) return false;
    downloadBlob(new Blob([framed.svg], { type: 'image/svg+xml' }), `${fileName}.svg`);
    return true;
  }

  const raster = await renderFramedRaster(qr, source, qrPixels);
  if (!raster) return false;
  const mimeType = extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`;
  const blob = await new Promise<Blob | null>((resolve) => raster.canvas.toBlob(resolve, mimeType, 0.95));
  if (!blob) throw new Error('Failed to export the framed code');
  downloadBlob(blob, `${fileName}.${extension}`);
  return true;
}
