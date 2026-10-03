import { describe, it, expect } from 'vitest';

import {
  cardAvatarLogo,
  DEFAULT_LOGO_MARGIN,
  DEFAULT_LOGO_SIZE,
  DEFAULT_LOGO_URL,
  isDefaultLogo,
  withBrandLogo,
  withDefaultLogo,
  withLogo,
  withoutLogo,
} from '@/lib/qr/brand';
import { createQRCode, DEFAULT_QR_STYLE, type QRStyleConfig } from '@/lib/qr/generator';
import { checkDesign } from '@/lib/qr/design-checks';

const PLAIN: QRStyleConfig = { dotStyle: 'square', dotColor: '#112233', errorCorrectionLevel: 'M', cardLayout: 'none' };

describe('the default design', () => {
  it('has the Memento logo in the middle, at a size that is easy to see but safe to scan', () => {
    expect(DEFAULT_QR_STYLE.logoUrl).toBe(DEFAULT_LOGO_URL);
    expect(DEFAULT_QR_STYLE.logoSize).toBe(DEFAULT_LOGO_SIZE);
    expect(DEFAULT_QR_STYLE.logoMargin).toBe(DEFAULT_LOGO_MARGIN);
    expect(DEFAULT_LOGO_SIZE).toBeGreaterThanOrEqual(0.2);
    expect(DEFAULT_LOGO_SIZE).toBeLessThanOrEqual(0.3);
  });

  it('uses the strongest error correction, because a logo hides part of the code', () => {
    expect(DEFAULT_QR_STYLE.errorCorrectionLevel).toBe('H');
  });

  it('passes the design checks (no warning about the logo)', () => {
    const issues = checkDesign({ ...DEFAULT_QR_STYLE, data: 'https://memento-qr.vercel.app/q/ana-memorial' });

    expect(issues.filter((issue) => /logo/i.test(issue.text))).toEqual([]);
  });

  it('puts the logo into the generated code', () => {
    const qr = createQRCode({ ...DEFAULT_QR_STYLE, data: 'https://example.com' });
    const options = qr._options;

    expect(options.image).toBe(DEFAULT_LOGO_URL);
    expect(options.imageOptions.imageSize).toBe(DEFAULT_LOGO_SIZE);
    expect(options.imageOptions.hideBackgroundDots).toBe(true);
    expect(options.qrOptions.errorCorrectionLevel).toBe('H');
  });
});

describe('withBrandLogo (a brand-new code)', () => {
  it('adds the logo to a design that has none, and raises error correction so it still scans', () => {
    const style = withBrandLogo(PLAIN);

    expect(style).toMatchObject({
      logoUrl: DEFAULT_LOGO_URL,
      logoSize: DEFAULT_LOGO_SIZE,
      logoMargin: DEFAULT_LOGO_MARGIN,
      errorCorrectionLevel: 'H',
      dotColor: '#112233', // the rest of the design is untouched
    });
  });

  it('keeps Q, which is already enough for a logo', () => {
    expect(withBrandLogo({ ...PLAIN, errorCorrectionLevel: 'Q' }).errorCorrectionLevel).toBe('Q');
  });

  it('leaves a design that already has its own logo alone', () => {
    const own: QRStyleConfig = { ...PLAIN, logoUrl: 'https://s.example/own.png', logoSize: 0.3 };

    expect(withBrandLogo(own)).toBe(own);
  });

  it('respects a logo that was removed on purpose (for example in a saved template)', () => {
    const removed: QRStyleConfig = { ...PLAIN, logoRemoved: true };

    expect(withBrandLogo(removed)).toBe(removed);
  });

  it('keeps a size a design already chose', () => {
    expect(withBrandLogo({ ...PLAIN, logoSize: 0.2 }).logoSize).toBe(0.2);
  });
});

describe('removing, replacing and restoring the logo', () => {
  it('removing it leaves a plain code that a new design will not re-brand', () => {
    const plain = withoutLogo(DEFAULT_QR_STYLE);

    expect(plain.logoUrl).toBeUndefined();
    expect(plain.logoRemoved).toBe(true);
    expect(withBrandLogo(plain)).toBe(plain);
  });

  it('drops error correction back to the lighter level that was only raised for the logo', () => {
    expect(withoutLogo(DEFAULT_QR_STYLE).errorCorrectionLevel).toBe('M');
    expect(withoutLogo({ ...PLAIN, errorCorrectionLevel: 'Q' }).errorCorrectionLevel).toBe('Q'); // a choice someone made stays
  });

  it('a logo of your own replaces it and keeps the code scannable', () => {
    const own = withLogo(withoutLogo(DEFAULT_QR_STYLE), 'https://s.example/own.png');

    expect(own).toMatchObject({ logoUrl: 'https://s.example/own.png', errorCorrectionLevel: 'H' });
    expect(own.logoRemoved).toBeUndefined();
  });

  it('the Memento logo can be put back after it was removed', () => {
    const back = withDefaultLogo(withoutLogo(DEFAULT_QR_STYLE));

    expect(back).toMatchObject({ logoUrl: DEFAULT_LOGO_URL, logoSize: DEFAULT_LOGO_SIZE, errorCorrectionLevel: 'H' });
    expect(back.logoRemoved).toBeUndefined();
  });
});

describe('the logo beside a card layout’s title', () => {
  it('shows a logo someone chose, but not the Memento logo already in the middle of the code', () => {
    expect(isDefaultLogo(DEFAULT_LOGO_URL)).toBe(true);
    expect(cardAvatarLogo(DEFAULT_LOGO_URL)).toBeUndefined();
    expect(cardAvatarLogo('https://s.example/own.png')).toBe('https://s.example/own.png');
    expect(cardAvatarLogo(undefined)).toBeUndefined();
  });
});
