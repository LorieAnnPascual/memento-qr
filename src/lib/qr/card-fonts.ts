export type CardFontKey = 'playfair' | 'garamond' | 'inter' | 'montserrat' | 'lora' | 'oswald';

interface CardFontDefinition {
  label: string;
  /** Font family name as registered by next/font/google in src/app/layout.tsx. */
  family: string;
  fallback: 'serif' | 'sans-serif';
  titleWeight: string;
  captionWeight: string;
}

export const CARD_FONTS: Record<CardFontKey, CardFontDefinition> = {
  playfair: {
    label: 'Playfair Display (serif)',
    family: 'Playfair Display',
    fallback: 'serif',
    titleWeight: '700',
    captionWeight: '500',
  },
  garamond: {
    label: 'EB Garamond (serif)',
    family: 'EB Garamond',
    fallback: 'serif',
    titleWeight: '600',
    captionWeight: '400',
  },
  inter: {
    label: 'Inter (sans-serif)',
    family: 'Inter',
    fallback: 'sans-serif',
    titleWeight: '700',
    captionWeight: '400',
  },
  montserrat: {
    label: 'Montserrat (sans-serif)',
    family: 'Montserrat',
    fallback: 'sans-serif',
    titleWeight: '700',
    captionWeight: '400',
  },
  lora: {
    label: 'Lora (serif)',
    family: 'Lora',
    fallback: 'serif',
    titleWeight: '600',
    captionWeight: '400',
  },
  oswald: {
    label: 'Oswald (condensed)',
    family: 'Oswald',
    fallback: 'sans-serif',
    titleWeight: '600',
    captionWeight: '400',
  },
};

export const DEFAULT_TITLE_FONT: CardFontKey = 'playfair';
export const DEFAULT_CAPTION_FONT: CardFontKey = 'garamond';

export function cssFontFamily(key: CardFontKey | undefined): string {
  const font = CARD_FONTS[key ?? DEFAULT_TITLE_FONT];
  return `'${font.family}', ${font.fallback}`;
}

export function canvasTitleFont(key: CardFontKey | undefined, sizePx: number): string {
  const font = CARD_FONTS[key ?? DEFAULT_TITLE_FONT];
  return `${font.titleWeight} ${sizePx}px '${font.family}', ${font.fallback}`;
}

export function canvasCaptionFont(key: CardFontKey | undefined, sizePx: number): string {
  const font = CARD_FONTS[key ?? DEFAULT_CAPTION_FONT];
  return `${font.captionWeight} ${sizePx}px '${font.family}', ${font.fallback}`;
}
