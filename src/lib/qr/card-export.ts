import type QRCodeStyling from 'qr-code-styling';
import type { FileExtension } from 'qr-code-styling';

import { canvasCaptionFont, canvasTitleFont, CARD_FONTS, type CardFontKey } from './card-fonts';
import { SOCIAL_BADGES, type SocialLink } from './social-badges';
import { downloadBlob, drawCoverImage, escapeXml, getQrPngImage, loadImage } from './card-export-utils';
import { exportCustomCard } from './custom-card-export';
import type { CustomCardDesign } from './card-builder-types';

export type QRCardLayout = 'none' | 'horizontal' | 'vertical' | 'custom';

export interface QRCardOptions {
  layout: QRCardLayout;
  /** Required when layout is 'custom'; ignored otherwise. */
  customCard?: CustomCardDesign;
  title: string;
  caption?: string;
  backgroundColor?: string;
  backgroundImageUrl?: string;
  /** 0-20px gaussian blur applied to backgroundImageUrl only. */
  backgroundImageBlur?: number;
  titleColor?: string;
  captionColor?: string;
  titleFont?: CardFontKey;
  captionFont?: CardFontKey;
  /** The QR's own center logo — also shown as a small avatar on the card for vCard/social layouts. */
  logoUrl?: string;
  socialLinks?: SocialLink[];
}

const QR_RENDER_SIZE = 480;
const PADDING = 40;
const TEXT_AREA_WIDTH = 280;
const DEFAULT_CAPTION_COLOR = '#6b5f52';
const DEFAULT_TEXT_COLOR = '#23334e';
const AVATAR_SIZE = 56;
const AVATAR_GAP = 14;
const BADGE_SIZE = 30;
const BADGE_GAP = 8;

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  if (lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }
  return lines;
}

async function loadCardFonts(card: QRCardOptions): Promise<void> {
  await Promise.all([
    document.fonts.load(canvasTitleFont(card.titleFont, 28)),
    document.fonts.load(canvasCaptionFont(card.captionFont, 18)),
  ]);
}

function drawCircularImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  size: number,
): void {
  context.save();
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  context.closePath();
  context.clip();
  context.fillStyle = '#FFFFFF';
  context.fillRect(x, y, size, size);
  drawCoverImage(context, image, x, y, size, size);
  context.restore();
}

function drawSocialBadgeRow(
  context: CanvasRenderingContext2D,
  links: SocialLink[],
  centerX: number,
  y: number,
): void {
  const totalWidth = links.length * BADGE_SIZE + (links.length - 1) * BADGE_GAP;
  let x = centerX - totalWidth / 2;

  for (const link of links) {
    const badge = SOCIAL_BADGES[link.platform];
    context.beginPath();
    context.arc(x + BADGE_SIZE / 2, y + BADGE_SIZE / 2, BADGE_SIZE / 2, 0, Math.PI * 2);
    context.fillStyle = badge.color;
    context.fill();

    context.fillStyle = '#FFFFFF';
    context.font = `700 ${Math.round(BADGE_SIZE * 0.4)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(badge.glyph, x + BADGE_SIZE / 2, y + BADGE_SIZE / 2 + 1);

    x += BADGE_SIZE + BADGE_GAP;
  }

  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
}

/** A drawn card plus where its QR code sits in it, both in canvas pixels. */
export interface RenderedCard {
  canvas: HTMLCanvasElement;
  qrRect: { x: number; y: number; width: number; height: number };
}

/**
 * Draws a horizontal or vertical card. `scale` multiplies the pixel size (the
 * layout itself is unchanged), so print exports can be sharper than the screen.
 */
export async function renderCardRaster(qr: QRCodeStyling, card: QRCardOptions, scale: number = 1): Promise<RenderedCard> {
  await loadCardFonts(card);
  const [image, backgroundImage, logoImage] = await Promise.all([
    getQrPngImage(qr),
    card.backgroundImageUrl ? loadImage(card.backgroundImageUrl) : Promise.resolve(null),
    card.logoUrl ? loadImage(card.logoUrl) : Promise.resolve(null),
  ]);
  const socialLinks = card.socialLinks ?? [];

  const isHorizontal = card.layout === 'horizontal';
  const extraContentHeight =
    (logoImage ? AVATAR_SIZE + AVATAR_GAP : 0) + (socialLinks.length ? 16 + BADGE_SIZE : 0);
  const width = isHorizontal
    ? PADDING * 3 + QR_RENDER_SIZE + TEXT_AREA_WIDTH
    : PADDING * 2 + Math.max(QR_RENDER_SIZE, TEXT_AREA_WIDTH);
  const height = isHorizontal
    ? PADDING * 2 + QR_RENDER_SIZE
    : PADDING * 3 + QR_RENDER_SIZE + 100 + extraContentHeight;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not supported in this browser');
  context.scale(scale, scale);

  context.fillStyle = card.backgroundColor || '#FFFFFF';
  context.fillRect(0, 0, width, height);
  if (backgroundImage) {
    const blur = card.backgroundImageBlur ?? 0;
    // Oversize the drawn box by the blur radius so the gaussian blur doesn't
    // leave an unblurred sliver visible at the canvas edges. (Canvas filters
    // ignore the transform, so the radius is scaled by hand.)
    context.filter = blur ? `blur(${blur * scale}px)` : 'none';
    drawCoverImage(context, backgroundImage, -blur, -blur, width + blur * 2, height + blur * 2);
    context.filter = 'none';
  }

  const titleColor = card.titleColor || DEFAULT_TEXT_COLOR;
  const captionColor = card.captionColor || DEFAULT_CAPTION_COLOR;
  const titleFont = canvasTitleFont(card.titleFont, 28);
  const captionFont = canvasCaptionFont(card.captionFont, 18);

  // The QR itself keeps a white plate behind it so it stays scannable against
  // a colored or busy card background.
  const qrPlatePadding = 12;

  if (isHorizontal) {
    context.fillStyle = '#FFFFFF';
    context.fillRect(
      PADDING - qrPlatePadding,
      PADDING - qrPlatePadding,
      QR_RENDER_SIZE + qrPlatePadding * 2,
      QR_RENDER_SIZE + qrPlatePadding * 2,
    );
    context.drawImage(image, PADDING, PADDING, QR_RENDER_SIZE, QR_RENDER_SIZE);

    const textX = PADDING * 2 + QR_RENDER_SIZE;
    const textMaxWidth = TEXT_AREA_WIDTH;

    context.font = titleFont;
    const titleLines = wrapText(context, card.title, textMaxWidth, 3);
    context.font = captionFont;
    const captionLines = card.caption ? wrapText(context, card.caption, textMaxWidth, 3) : [];

    const avatarBlockHeight = logoImage ? AVATAR_SIZE + AVATAR_GAP : 0;
    const titleBlockHeight = titleLines.length * 34;
    const captionBlockHeight = captionLines.length ? 10 + captionLines.length * 24 : 0;
    const badgeBlockHeight = socialLinks.length ? 16 + BADGE_SIZE : 0;
    const totalHeight = avatarBlockHeight + titleBlockHeight + captionBlockHeight + badgeBlockHeight;

    let cursorY = (height - totalHeight) / 2;

    if (logoImage) {
      drawCircularImage(context, logoImage, textX, cursorY, AVATAR_SIZE);
      cursorY += avatarBlockHeight;
    }

    context.textBaseline = 'alphabetic';
    context.fillStyle = titleColor;
    context.font = titleFont;
    let textY = cursorY + 26;
    titleLines.forEach((line) => {
      context.fillText(line, textX, textY);
      textY += 34;
    });
    cursorY += titleBlockHeight;

    if (captionLines.length) {
      cursorY += 10;
      let captionY = cursorY + 16;
      context.fillStyle = captionColor;
      context.font = captionFont;
      captionLines.forEach((line) => {
        context.fillText(line, textX, captionY);
        captionY += 24;
      });
      cursorY += captionBlockHeight - 10;
    }

    if (socialLinks.length) {
      cursorY += 16;
      const rowWidth = socialLinks.length * BADGE_SIZE + (socialLinks.length - 1) * BADGE_GAP;
      drawSocialBadgeRow(context, socialLinks, textX + rowWidth / 2, cursorY);
    }
  } else {
    const qrX = (width - QR_RENDER_SIZE) / 2;
    context.fillStyle = '#FFFFFF';
    context.fillRect(
      qrX - qrPlatePadding,
      PADDING - qrPlatePadding,
      QR_RENDER_SIZE + qrPlatePadding * 2,
      QR_RENDER_SIZE + qrPlatePadding * 2,
    );
    context.drawImage(image, qrX, PADDING, QR_RENDER_SIZE, QR_RENDER_SIZE);

    let cursorY = PADDING * 2 + QR_RENDER_SIZE + 20;

    if (logoImage) {
      drawCircularImage(context, logoImage, width / 2 - AVATAR_SIZE / 2, cursorY, AVATAR_SIZE);
      cursorY += AVATAR_SIZE + AVATAR_GAP;
    }

    let textY = cursorY + 16;
    context.textAlign = 'center';
    context.fillStyle = titleColor;
    context.font = titleFont;
    const titleLines = wrapText(context, card.title, width - PADDING * 2, 2);
    titleLines.forEach((line) => {
      context.fillText(line, width / 2, textY);
      textY += 34;
    });

    if (card.caption) {
      textY += 6;
      context.fillStyle = captionColor;
      context.font = captionFont;
      const captionLines = wrapText(context, card.caption, width - PADDING * 2, 2);
      captionLines.forEach((line) => {
        context.fillText(line, width / 2, textY);
        textY += 24;
      });
    }
    context.textAlign = 'left';

    if (socialLinks.length) {
      drawSocialBadgeRow(context, socialLinks, width / 2, textY + 10);
    }
  }

  const qrRect = isHorizontal
    ? { x: PADDING * scale, y: PADDING * scale, width: QR_RENDER_SIZE * scale, height: QR_RENDER_SIZE * scale }
    : { x: ((width - QR_RENDER_SIZE) / 2) * scale, y: PADDING * scale, width: QR_RENDER_SIZE * scale, height: QR_RENDER_SIZE * scale };

  return { canvas, qrRect };
}

async function exportCardAsRaster(
  qr: QRCodeStyling,
  extension: Exclude<FileExtension, 'svg'>,
  fileName: string,
  card: QRCardOptions,
): Promise<void> {
  const { canvas } = await renderCardRaster(qr, card);
  const mimeType = extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`;

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, 0.95);
  });

  if (!blob) throw new Error('Failed to export card image');

  downloadBlob(blob, `${fileName}.${extension}`);
}

function svgAvatarMarkup(url: string, cx: number, top: number, size: number): string {
  const cy = top + size / 2;
  return `
    <clipPath id="avatar-clip"><circle cx="${cx}" cy="${cy}" r="${size / 2}" /></clipPath>
    <circle cx="${cx}" cy="${cy}" r="${size / 2}" fill="#FFFFFF" />
    <image href="${escapeXml(url)}" x="${cx - size / 2}" y="${top}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar-clip)" />
  `;
}

function svgBadgeRowMarkup(links: SocialLink[], centerX: number, y: number): string {
  const totalWidth = links.length * BADGE_SIZE + (links.length - 1) * BADGE_GAP;
  let x = centerX - totalWidth / 2;

  return links
    .map((link) => {
      const badge = SOCIAL_BADGES[link.platform];
      const cx = x + BADGE_SIZE / 2;
      const cy = y + BADGE_SIZE / 2;
      x += BADGE_SIZE + BADGE_GAP;
      return `
        <circle cx="${cx}" cy="${cy}" r="${BADGE_SIZE / 2}" fill="${badge.color}" />
        <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-weight="700" font-size="${Math.round(BADGE_SIZE * 0.4)}" fill="#FFFFFF">${escapeXml(badge.glyph)}</text>
      `;
    })
    .join('');
}

async function exportCardAsSvg(
  qr: QRCodeStyling,
  fileName: string,
  card: QRCardOptions,
): Promise<void> {
  const blob = await qr.getRawData('svg');
  if (!blob || !(blob instanceof Blob)) {
    throw new Error('Failed to render QR code SVG');
  }
  const qrSvgText = await blob.text();
  const innerSvgMatch = /<svg[^>]*>([\s\S]*)<\/svg>/i.exec(qrSvgText);
  const qrInnerMarkup = innerSvgMatch ? innerSvgMatch[1] : '';

  const socialLinks = card.socialLinks ?? [];
  const isHorizontal = card.layout === 'horizontal';
  const avatarOffset = card.logoUrl ? AVATAR_SIZE + AVATAR_GAP : 0;
  const badgeOffset = socialLinks.length ? BADGE_SIZE + 16 : 0;
  const width = isHorizontal
    ? PADDING * 3 + QR_RENDER_SIZE + TEXT_AREA_WIDTH
    : PADDING * 2 + Math.max(QR_RENDER_SIZE, TEXT_AREA_WIDTH);
  const height = isHorizontal
    ? PADDING * 2 + QR_RENDER_SIZE
    : PADDING * 3 + QR_RENDER_SIZE + 100 + avatarOffset + badgeOffset;

  const qrX = isHorizontal ? PADDING : (width - QR_RENDER_SIZE) / 2;
  const qrY = PADDING;

  const title = escapeXml(card.title);
  const caption = card.caption ? escapeXml(card.caption) : '';
  const titleColor = card.titleColor || DEFAULT_TEXT_COLOR;
  const captionColor = card.captionColor || DEFAULT_CAPTION_COLOR;
  const titleFontFamily = CARD_FONTS[card.titleFont ?? 'playfair'].family;
  const captionFontFamily = CARD_FONTS[card.captionFont ?? 'garamond'].family;
  const titleWeight = CARD_FONTS[card.titleFont ?? 'playfair'].titleWeight;
  const captionWeight = CARD_FONTS[card.captionFont ?? 'garamond'].captionWeight;

  const textX = isHorizontal ? PADDING * 2 + QR_RENDER_SIZE : width / 2;
  const titleY = (isHorizontal ? height / 2 - 10 : PADDING * 2 + QR_RENDER_SIZE + 30) + avatarOffset;
  const captionY = (isHorizontal ? height / 2 + 24 : PADDING * 2 + QR_RENDER_SIZE + 60) + avatarOffset;
  const badgeY = (caption ? captionY : titleY) + (isHorizontal ? 30 : 20);

  const textBlock = `
      <text x="${textX}" y="${titleY}"${isHorizontal ? '' : ' text-anchor="middle"'} font-family="'${titleFontFamily}', serif" font-weight="${titleWeight}" font-size="28" fill="${titleColor}">${title}</text>
      ${caption ? `<text x="${textX}" y="${captionY}"${isHorizontal ? '' : ' text-anchor="middle"'} font-family="'${captionFontFamily}', serif" font-weight="${captionWeight}" font-size="18" fill="${captionColor}">${caption}</text>` : ''}
    `;

  const avatarMarkup = card.logoUrl
    ? svgAvatarMarkup(
        card.logoUrl,
        isHorizontal ? textX + AVATAR_SIZE / 2 : width / 2,
        (isHorizontal ? height / 2 - 60 : PADDING * 2 + QR_RENDER_SIZE + 20),
        AVATAR_SIZE,
      )
    : '';
  const badgeMarkup = socialLinks.length
    ? svgBadgeRowMarkup(socialLinks, isHorizontal ? textX + 80 : width / 2, badgeY - BADGE_SIZE / 2)
    : '';

  const qrPlatePadding = 12;
  const blur = card.backgroundImageBlur ?? 0;
  const blurFilter = blur
    ? `<filter id="bg-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${blur / 2}" /></filter>`
    : '';
  const backgroundImageTag = card.backgroundImageUrl
    ? `<image href="${escapeXml(card.backgroundImageUrl)}" x="${-blur}" y="${-blur}" width="${width + blur * 2}" height="${height + blur * 2}" preserveAspectRatio="xMidYMid slice"${blur ? ' filter="url(#bg-blur)"' : ''} />`
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>${blurFilter}</defs>
    <rect x="0" y="0" width="${width}" height="${height}" fill="${card.backgroundColor || '#FFFFFF'}" />
    ${backgroundImageTag}
    <rect x="${qrX - qrPlatePadding}" y="${qrY - qrPlatePadding}" width="${QR_RENDER_SIZE + qrPlatePadding * 2}" height="${QR_RENDER_SIZE + qrPlatePadding * 2}" fill="#FFFFFF" />
    <svg x="${qrX}" y="${qrY}" width="${QR_RENDER_SIZE}" height="${QR_RENDER_SIZE}">${qrInnerMarkup}</svg>
    ${avatarMarkup}
    ${textBlock}
    ${badgeMarkup}
  </svg>`;

  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${fileName}.svg`);
}

export async function exportQRCard(
  qr: QRCodeStyling,
  extension: FileExtension,
  fileName: string,
  card: QRCardOptions,
): Promise<void> {
  if (card.layout === 'custom' && card.customCard) {
    await exportCustomCard(qr, extension, fileName, card.customCard, {
      backgroundColor: card.backgroundColor,
      backgroundImageUrl: card.backgroundImageUrl,
      backgroundImageBlur: card.backgroundImageBlur,
    });
    return;
  }

  if (extension === 'svg') {
    await exportCardAsSvg(qr, fileName, card);
  } else {
    await exportCardAsRaster(qr, extension, fileName, card);
  }
}
