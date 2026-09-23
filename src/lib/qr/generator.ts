import QRCodeStyling, { type FileExtension, type Options } from 'qr-code-styling';

import type { CardFontKey } from './card-fonts';
import type { CustomCardDesign } from './card-builder-types';

export interface ColorStop {
  offset: number;
  color: string;
}

export interface QRGradient {
  type: 'linear' | 'radial';
  rotation?: number;
  colorStops: ColorStop[];
}

export type DotStyle = 'rounded' | 'dots' | 'classy' | 'classy-rounded' | 'square' | 'extra-rounded';
export type CornerSquareStyle = 'dot' | 'square' | 'extra-rounded';
export type CornerDotStyle = 'dot' | 'square';
export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';
export type QRCardLayout = 'none' | 'horizontal' | 'vertical' | 'custom';

export interface QRDesignConfig {
  data: string;
  width?: number;
  height?: number;
  type?: 'canvas' | 'svg';
  dotStyle?: DotStyle;
  dotColor?: string;
  dotGradient?: QRGradient;
  cornerSquareStyle?: CornerSquareStyle;
  cornerSquareColor?: string;
  cornerDotStyle?: CornerDotStyle;
  cornerDotColor?: string;
  backgroundColor?: string;
  backgroundGradient?: QRGradient;
  /** 0-100. Only applied to a solid backgroundColor, ignored when a gradient is set. */
  backgroundOpacity?: number;
  logoUrl?: string;
  logoSize?: number;
  logoMargin?: number;
  errorCorrectionLevel?: ErrorCorrectionLevel;
  /** Presentation layout used for the on-screen preview and export — ignored by qr-code-styling itself. */
  cardLayout?: QRCardLayout;
  cardCaption?: string;
  /** Card's own background — independent of the QR module background above. */
  cardBackgroundColor?: string;
  cardBackgroundImage?: string;
  /** 0-20px gaussian blur applied to cardBackgroundImage only (not the color fallback). */
  cardBackgroundImageBlur?: number;
  cardTitleColor?: string;
  cardCaptionColor?: string;
  cardTitleFont?: CardFontKey;
  cardCaptionFont?: CardFontKey;
  /** Only used when cardLayout is 'custom' — a freeform design built in the Card Builder. */
  customCard?: CustomCardDesign;
}

export type QRStyleConfig = Omit<QRDesignConfig, 'data'>;

export const DEFAULT_QR_STYLE: QRStyleConfig = {
  dotStyle: 'rounded',
  dotColor: '#000000',
  cornerSquareStyle: 'extra-rounded',
  cornerSquareColor: '#000000',
  cornerDotStyle: 'dot',
  cornerDotColor: '#000000',
  backgroundColor: '#FFFFFF',
  errorCorrectionLevel: 'M',
  cardLayout: 'none',
};

/** Converts a `#rrggbb`/`#rgb` hex color plus a 0-100 opacity into an `rgba()` string. Returns the color as-is if it isn't a hex color (e.g. already rgba, or a named color). */
export function hexToRgba(hex: string, opacityPercent: number): string {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;

  const full =
    match[1].length === 3
      ? match[1]
          .split('')
          .map((c) => c + c)
          .join('')
      : match[1];

  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  const alpha = Math.max(0, Math.min(100, opacityPercent)) / 100;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function resolveBackgroundColor(config: QRDesignConfig): string {
  const color = config.backgroundColor ?? '#FFFFFF';
  if (config.backgroundGradient || config.backgroundOpacity === undefined) {
    return color;
  }
  return hexToRgba(color, config.backgroundOpacity);
}

export function createQRCode(config: QRDesignConfig): QRCodeStyling {
  const options: Options = {
    width: config.width ?? 1024,
    height: config.height ?? 1024,
    type: config.type ?? 'svg',
    data: config.data,
    dotsOptions: {
      type: config.dotStyle ?? 'rounded',
      color: config.dotColor ?? '#000000',
      ...(config.dotGradient && { gradient: config.dotGradient }),
    },
    cornersSquareOptions: {
      type: config.cornerSquareStyle ?? 'extra-rounded',
      color: config.cornerSquareColor ?? '#000000',
    },
    cornersDotOptions: {
      type: config.cornerDotStyle ?? 'dot',
      color: config.cornerDotColor ?? '#000000',
    },
    backgroundOptions: {
      color: resolveBackgroundColor(config),
      ...(config.backgroundGradient && { gradient: config.backgroundGradient }),
    },
    ...(config.logoUrl && {
      image: config.logoUrl,
      imageOptions: {
        crossOrigin: 'anonymous',
        margin: config.logoMargin ?? 5,
        imageSize: config.logoSize ?? 0.4,
        hideBackgroundDots: true,
      },
    }),
    qrOptions: {
      errorCorrectionLevel: config.errorCorrectionLevel ?? (config.logoUrl ? 'H' : 'M'),
    },
  };

  return new QRCodeStyling(options);
}

export async function downloadQR(
  qr: QRCodeStyling,
  format: FileExtension,
  fileName: string,
): Promise<void> {
  await qr.download({ name: fileName, extension: format });
}

export function createPrintQR(config: QRDesignConfig): QRCodeStyling {
  return createQRCode({
    ...config,
    width: 2048,
    height: 2048,
    type: 'svg',
    errorCorrectionLevel: 'H',
  });
}
