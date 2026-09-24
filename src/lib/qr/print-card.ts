import { renderCardRaster, type QRCardOptions, type RenderedCard } from './card-export';
import { renderCustomCardCanvas } from './custom-card-export';
import { createQRCode, type QRDesignConfig } from './generator';
import {
  croppedShare,
  mmToPixels,
  qrPhysicalWidthMm,
  type PrintLayout,
} from './print-layout';
import { buildPrintPdf } from './print-pdf';
import { downloadBlob } from './card-export-utils';
import type { SocialLink } from './social-badges';

/** The card drawn large once; resized into different print shapes without redrawing. */
export interface BaseCard {
  canvas: HTMLCanvasElement;
  /** Where the QR sits in the canvas (pixels), if it can be found. */
  qrRect: { x: number; y: number; width: number; height: number } | null;
}

export interface PrintArtwork {
  /** The picture that fills the bleed area (trim plus bleed), at print resolution. */
  canvas: HTMLCanvasElement;
  /** How wide the QR will be on paper, or null when it cannot be worked out. */
  qrWidthMm: number | null;
  /** Share of the card design cut off to fit the chosen shape (0 to 1). */
  cropped: number;
}

const BASE_SCALE = 3;

/** Draws `source` to fill the box, centre-cropping what does not fit (like CSS background-size: cover). */
function drawCover(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const scale = Math.max(dw / source.width, dh / source.height);
  const sw = dw / scale;
  const sh = dh / scale;
  context.drawImage(source, (source.width - sw) / 2, (source.height - sh) / 2, sw, sh, dx, dy, dw, dh);
}

/** Draws the user's current card design (or a plain horizontal card if it has none) at high resolution. */
export async function renderBaseCard(
  config: QRDesignConfig,
  options: { title: string; socialLinks: SocialLink[] },
): Promise<BaseCard> {
  // A sharper QR than the on-screen one: it will be printed.
  const qr = createQRCode({ ...config, width: 2048, height: 2048, type: 'svg' });

  let rendered: RenderedCard | { canvas: HTMLCanvasElement; qrRect: RenderedCard['qrRect'] | null };

  if (config.cardLayout === 'custom' && config.customCard) {
    rendered = await renderCustomCardCanvas(
      qr,
      config.customCard,
      {
        backgroundColor: config.cardBackgroundColor,
        backgroundImageUrl: config.cardBackgroundImage,
        backgroundImageBlur: config.cardBackgroundImageBlur,
      },
      BASE_SCALE,
    );
  } else {
    const layout = config.cardLayout === 'vertical' ? 'vertical' : 'horizontal';
    const card: QRCardOptions = {
      layout,
      title: options.title,
      caption: config.cardCaption,
      backgroundColor: config.cardBackgroundColor,
      backgroundImageUrl: config.cardBackgroundImage,
      backgroundImageBlur: config.cardBackgroundImageBlur,
      titleColor: config.cardTitleColor,
      captionColor: config.cardCaptionColor,
      titleFont: config.cardTitleFont,
      captionFont: config.cardCaptionFont,
      logoUrl: config.logoUrl,
      socialLinks: options.socialLinks,
    };
    rendered = await renderCardRaster(qr, card, BASE_SCALE);
  }

  return { canvas: rendered.canvas, qrRect: rendered.qrRect };
}

/**
 * Fits the card into a print shape. The design fills the trim area; the same
 * design is also stretched over the whole bleed area underneath, so the colour
 * or picture runs past the cut line and no white edge shows if the cut is a
 * little off.
 */
export function composeArtwork(base: BaseCard, layout: PrintLayout, widthMm: number, heightMm: number): PrintArtwork {
  const outWidth = mmToPixels(layout.bleed.width);
  const outHeight = mmToPixels(layout.bleed.height);

  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not supported in this browser');

  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, outWidth, outHeight);

  // Underlay: the whole bleed area, for the bleed to be filled.
  drawCover(context, base.canvas, 0, 0, outWidth, outHeight);

  // The design itself, exactly on the trim area.
  const pxPerMm = outWidth / layout.bleed.width;
  drawCover(
    context,
    base.canvas,
    (layout.trim.x - layout.bleed.x) * pxPerMm,
    (layout.trim.y - layout.bleed.y) * pxPerMm,
    widthMm * pxPerMm,
    heightMm * pxPerMm,
  );

  return {
    canvas,
    qrWidthMm: base.qrRect
      ? qrPhysicalWidthMm(base.qrRect.width, base.canvas.width, base.canvas.height, widthMm, heightMm)
      : null,
    cropped: croppedShare(base.canvas.width, base.canvas.height, widthMm, heightMm),
  };
}

/** The card's own height for a given width, so nothing is cropped or stretched. */
export function heightForWidthMm(base: BaseCard, widthMm: number): number {
  return widthMm / (base.canvas.width / base.canvas.height);
}

/** Builds the PDF and downloads it. */
export async function downloadPrintPdf(artwork: PrintArtwork, layout: PrintLayout, fileName: string): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) => artwork.canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Failed to render the print artwork');

  const pdf = await buildPrintPdf(new Uint8Array(await blob.arrayBuffer()), layout, fileName);
  downloadBlob(new Blob([pdf as BlobPart], { type: 'application/pdf' }), `${fileName}-print.pdf`);
}
