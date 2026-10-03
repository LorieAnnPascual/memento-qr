import type { ErrorCorrectionLevel, QRStyleConfig } from './generator';

/**
 * The Memento QR logo placed in the middle of every new QR code. A small square version of
 * the app's logo (`scripts/build-qr-logo.ts` makes it from `public/logo.svg`), so previews and
 * downloads stay light. It is a plain path, so it works in every place a QR is drawn.
 */
export const DEFAULT_LOGO_URL = '/memento-qr-logo.png';

/** Share of the code's width the logo covers: big enough to see at a glance, well inside what error correction can absorb. */
export const DEFAULT_LOGO_SIZE = 0.3;
export const DEFAULT_LOGO_MARGIN = 4;

/** A logo in the middle needs the strongest error correction, or the code may not scan. */
export const LOGO_ERROR_CORRECTION: ErrorCorrectionLevel = 'H';
/** What a code needs without a logo: smaller and quicker to scan. */
export const PLAIN_ERROR_CORRECTION: ErrorCorrectionLevel = 'M';

export function isDefaultLogo(url: string | undefined): boolean {
  return url === DEFAULT_LOGO_URL;
}

/**
 * The style of a brand-new code: adds the Memento logo unless the design already has a logo of
 * its own, or someone deliberately removed it (`logoRemoved`, which a saved template keeps).
 * Saved codes are never passed through this, so what is already printed does not change.
 */
export function withBrandLogo(style: QRStyleConfig): QRStyleConfig {
  if (style.logoUrl || style.logoRemoved) return style;

  return {
    ...style,
    logoUrl: DEFAULT_LOGO_URL,
    logoSize: style.logoSize ?? DEFAULT_LOGO_SIZE,
    logoMargin: style.logoMargin ?? DEFAULT_LOGO_MARGIN,
    errorCorrectionLevel: style.errorCorrectionLevel === 'Q' ? 'Q' : LOGO_ERROR_CORRECTION,
  };
}

/** The style with no logo at all (the person asked for a plain code). Error correction drops back if it was only high for the logo. */
export function withoutLogo(style: QRStyleConfig): QRStyleConfig {
  return {
    ...style,
    logoUrl: undefined,
    logoRemoved: true,
    errorCorrectionLevel: style.errorCorrectionLevel === LOGO_ERROR_CORRECTION ? PLAIN_ERROR_CORRECTION : style.errorCorrectionLevel,
  };
}

/** Uses a logo someone chose (an upload or one from Media), keeping the code scannable. */
export function withLogo(style: QRStyleConfig, url: string): QRStyleConfig {
  return {
    ...style,
    logoUrl: url,
    logoRemoved: undefined,
    logoSize: style.logoSize ?? DEFAULT_LOGO_SIZE,
    logoMargin: style.logoMargin ?? DEFAULT_LOGO_MARGIN,
    errorCorrectionLevel: style.errorCorrectionLevel === 'Q' ? 'Q' : LOGO_ERROR_CORRECTION,
  };
}

/** Puts the Memento logo back after it was removed. */
export function withDefaultLogo(style: QRStyleConfig): QRStyleConfig {
  return {
    ...style,
    logoUrl: DEFAULT_LOGO_URL,
    logoRemoved: undefined,
    logoSize: DEFAULT_LOGO_SIZE,
    logoMargin: DEFAULT_LOGO_MARGIN,
    errorCorrectionLevel: style.errorCorrectionLevel === 'Q' ? 'Q' : LOGO_ERROR_CORRECTION,
  };
}

/**
 * The logo a card layout may show beside its title. Only a logo someone chose: the Memento
 * logo is already in the middle of the code, and showing it twice would be clutter.
 */
export function cardAvatarLogo(url: string | undefined): string | undefined {
  return url && !isDefaultLogo(url) ? url : undefined;
}
