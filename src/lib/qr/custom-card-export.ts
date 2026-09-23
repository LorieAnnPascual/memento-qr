import type QRCodeStyling from 'qr-code-styling';
import type { FileExtension } from 'qr-code-styling';

import type { CardElement, CustomCardDesign } from './card-builder-types';
import { CARD_FONTS } from './card-fonts';
import {
  downloadBlob,
  drawContainImage,
  drawCoverImage,
  escapeXml,
  extractSvgInnerMarkup,
  getQrPngImage,
  loadImage,
} from './card-export-utils';

// Raster exports render at this multiple of the design canvas's pixel size
// for print-quality output; SVG exports use the design size directly since
// vector output is resolution-independent.
const RASTER_SCALE = 2;

interface CustomCardBackground {
  backgroundColor?: string;
  backgroundImageUrl?: string;
  backgroundImageBlur?: number;
}

async function loadElementImages(elements: CardElement[]): Promise<Map<string, HTMLImageElement>> {
  const images = new Map<string, HTMLImageElement>();
  await Promise.all(
    elements
      .filter((el): el is Extract<CardElement, { type: 'image' }> => el.type === 'image')
      .map(async (el) => {
        try {
          images.set(el.id, await loadImage(el.url));
        } catch (error) {
          console.error('Failed to load card builder image element:', error);
        }
      }),
  );
  return images;
}

async function exportCustomCardAsRaster(
  qr: QRCodeStyling,
  extension: Exclude<FileExtension, 'svg'>,
  fileName: string,
  design: CustomCardDesign,
  background: CustomCardBackground,
): Promise<void> {
  const textElements = design.elements.filter(
    (el): el is Extract<CardElement, { type: 'text' }> => el.type === 'text',
  );

  const [qrImage, backgroundImage, elementImages] = await Promise.all([
    getQrPngImage(qr),
    background.backgroundImageUrl ? loadImage(background.backgroundImageUrl) : Promise.resolve(null),
    loadElementImages(design.elements),
  ]);

  await Promise.all(
    textElements.map((el) =>
      document.fonts.load(
        `${el.bold ? '700' : '400'} ${el.fontSize * RASTER_SCALE}px '${CARD_FONTS[el.fontFamily].family}'`,
      ),
    ),
  );

  const width = design.width * RASTER_SCALE;
  const height = design.height * RASTER_SCALE;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not supported in this browser');

  context.fillStyle = background.backgroundColor || '#FFFFFF';
  context.fillRect(0, 0, width, height);
  if (backgroundImage) {
    const blur = (background.backgroundImageBlur ?? 0) * RASTER_SCALE;
    context.filter = blur ? `blur(${blur}px)` : 'none';
    drawCoverImage(context, backgroundImage, -blur, -blur, width + blur * 2, height + blur * 2);
    context.filter = 'none';
  }

  const sorted = [...design.elements].sort((a, b) => a.zIndex - b.zIndex);

  for (const el of sorted) {
    const x = el.x * RASTER_SCALE;
    const y = el.y * RASTER_SCALE;
    const w = el.width * RASTER_SCALE;
    const h = el.height * RASTER_SCALE;

    if (el.type === 'qr') {
      context.drawImage(qrImage, x, y, w, h);
    } else if (el.type === 'shape') {
      context.globalAlpha = el.opacity / 100;
      context.fillStyle = el.color;
      if (el.shape === 'circle') {
        context.beginPath();
        context.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillRect(x, y, w, h);
      }
      context.globalAlpha = 1;
    } else if (el.type === 'image') {
      const image = elementImages.get(el.id);
      if (image) drawContainImage(context, image, x, y, w, h);
    } else if (el.type === 'text') {
      const fontSize = el.fontSize * RASTER_SCALE;
      const font = CARD_FONTS[el.fontFamily];
      context.font = `${el.bold ? '700' : '400'} ${fontSize}px '${font.family}', ${font.fallback}`;
      context.fillStyle = el.color;
      context.textBaseline = 'top';
      context.textAlign = el.align;
      const lineHeight = fontSize * 1.25;
      const lines = el.text.split('\n');
      const anchorX = el.align === 'center' ? x + w / 2 : el.align === 'right' ? x + w : x;
      lines.forEach((line, i) => {
        context.fillText(line, anchorX, y + i * lineHeight, w);
      });
      context.textAlign = 'left';
      context.textBaseline = 'alphabetic';
    }
  }

  const mimeType = extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, 0.95));
  if (!blob) throw new Error('Failed to export card image');

  downloadBlob(blob, `${fileName}.${extension}`);
}

function svgTextMarkup(el: Extract<CardElement, { type: 'text' }>): string {
  const font = CARD_FONTS[el.fontFamily];
  const anchor = el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start';
  const anchorX = el.align === 'center' ? el.x + el.width / 2 : el.align === 'right' ? el.x + el.width : el.x;
  const lineHeight = el.fontSize * 1.25;
  const lines = el.text.split('\n');

  return `<text x="${anchorX}" y="${el.y + el.fontSize}" text-anchor="${anchor}" font-family="'${font.family}', ${font.fallback}" font-weight="${el.bold ? 700 : 400}" font-size="${el.fontSize}" fill="${el.color}">${lines
    .map(
      (line, i) =>
        `<tspan x="${anchorX}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join('')}</text>`;
}

async function exportCustomCardAsSvg(
  qr: QRCodeStyling,
  fileName: string,
  design: CustomCardDesign,
  background: CustomCardBackground,
): Promise<void> {
  const blob = await qr.getRawData('svg');
  if (!blob || !(blob instanceof Blob)) {
    throw new Error('Failed to render QR code SVG');
  }
  const qrInnerMarkup = extractSvgInnerMarkup(await blob.text());

  const { width, height } = design;
  const blur = background.backgroundImageBlur ?? 0;
  const blurFilter = blur
    ? `<filter id="bg-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${blur / 2}" /></filter>`
    : '';
  const backgroundImageTag = background.backgroundImageUrl
    ? `<image href="${escapeXml(background.backgroundImageUrl)}" x="${-blur}" y="${-blur}" width="${width + blur * 2}" height="${height + blur * 2}" preserveAspectRatio="xMidYMid slice"${blur ? ' filter="url(#bg-blur)"' : ''} />`
    : '';

  const sorted = [...design.elements].sort((a, b) => a.zIndex - b.zIndex);
  const elementsMarkup = sorted
    .map((el) => {
      if (el.type === 'qr') {
        return `<svg x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}">${qrInnerMarkup}</svg>`;
      }
      if (el.type === 'shape') {
        const opacity = el.opacity / 100;
        if (el.shape === 'circle') {
          return `<ellipse cx="${el.x + el.width / 2}" cy="${el.y + el.height / 2}" rx="${el.width / 2}" ry="${el.height / 2}" fill="${el.color}" fill-opacity="${opacity}" />`;
        }
        return `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" fill="${el.color}" fill-opacity="${opacity}" />`;
      }
      if (el.type === 'image') {
        return `<image href="${escapeXml(el.url)}" x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" preserveAspectRatio="xMidYMid meet" />`;
      }
      return svgTextMarkup(el);
    })
    .join('\n    ');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>${blurFilter}</defs>
    <rect x="0" y="0" width="${width}" height="${height}" fill="${background.backgroundColor || '#FFFFFF'}" />
    ${backgroundImageTag}
    ${elementsMarkup}
  </svg>`;

  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${fileName}.svg`);
}

export async function exportCustomCard(
  qr: QRCodeStyling,
  extension: FileExtension,
  fileName: string,
  design: CustomCardDesign,
  background: CustomCardBackground,
): Promise<void> {
  if (extension === 'svg') {
    await exportCustomCardAsSvg(qr, fileName, design, background);
  } else {
    await exportCustomCardAsRaster(qr, extension, fileName, design, background);
  }
}

