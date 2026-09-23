import { describe, it, expect } from 'vitest';

import { canvasCaptionFont, canvasTitleFont, cssFontFamily, CARD_FONTS } from '@/lib/qr/card-fonts';

describe('cssFontFamily', () => {
  it('returns the CSS font-family string for a given key', () => {
    expect(cssFontFamily('inter')).toBe("'Inter', sans-serif");
  });

  it('defaults to the title default font when no key is given', () => {
    expect(cssFontFamily(undefined)).toBe("'Playfair Display', serif");
  });
});

describe('canvasTitleFont', () => {
  it('builds a canvas font string with the title weight', () => {
    expect(canvasTitleFont('montserrat', 28)).toBe("700 28px 'Montserrat', sans-serif");
  });

  it('defaults to Playfair Display when no key is given', () => {
    expect(canvasTitleFont(undefined, 28)).toBe("700 28px 'Playfair Display', serif");
  });
});

describe('canvasCaptionFont', () => {
  it('builds a canvas font string with the caption weight', () => {
    expect(canvasCaptionFont('lora', 18)).toBe("400 18px 'Lora', serif");
  });

  it('defaults to EB Garamond when no key is given', () => {
    expect(canvasCaptionFont(undefined, 18)).toBe("400 18px 'EB Garamond', serif");
  });
});

describe('CARD_FONTS', () => {
  it('has a definition for every font key', () => {
    for (const key of Object.keys(CARD_FONTS)) {
      const font = CARD_FONTS[key as keyof typeof CARD_FONTS];
      expect(font.label).toBeTruthy();
      expect(font.family).toBeTruthy();
    }
  });
});
