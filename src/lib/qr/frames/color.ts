const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Accepts only `#rgb` / `#rrggbb` (anything else, including CSS functions, falls back) and returns it as lowercase `#rrggbb`. */
export function safeHex(value: unknown, fallback: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  const pick = HEX_COLOR.test(trimmed) ? trimmed : fallback;
  const hex = pick.slice(1).toLowerCase();
  const full = hex.length === 3 ? hex.replace(/./g, '$&$&') : hex;
  return `#${full}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const full = safeHex(hex, '#000000').slice(1);
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex(channel: number): string {
  return Math.round(Math.max(0, Math.min(255, channel)))
    .toString(16)
    .padStart(2, '0');
}

/** Blends `from` towards `to`; `amount` 0 is `from`, 1 is `to`. */
export function mixHex(from: string, to: string, amount: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return `#${[0, 1, 2].map((i) => toHex(a[i] + (b[i] - a[i]) * amount)).join('')}`;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const LIGHT_TEXT = '#ffffff';
const DARK_TEXT = '#1f2937';

/** White or near-black, whichever reads better on `background`. */
export function readableOn(background: string): string {
  return relativeLuminance(background) > 0.4 ? DARK_TEXT : LIGHT_TEXT;
}
