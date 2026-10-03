import { defineFrame } from '../types';

/** Bold corner brackets and a dark caption bar. */
export const businessFrame = defineFrame({
  id: 'business',
  label: 'Business',
  description: 'Corner brackets and a dark caption bar',
  occasion: 'everyday',
  defaultColor: '#14213d',
  defaultAccent: '#e07a1f',
  defaultCaption: 'Scan me',
  caption: { font: 'montserrat', weight: 700, uppercase: true, on: 'primary', charWidth: 0.74, maxSize: 48, widthFactor: 1 },
  render: (c) => {
    const { inset: i, width: w, height: h } = c;
    const long = 230;
    const short = 120;
    const inner = i + 30;

    const bracket = (x: number, y: number, dx: number, dy: number, len: number, stroke: string, width: number): string =>
      `<path d="M${x} ${y + dy * len}V${y}H${x + dx * len}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="square"/>`;

    const box = c.captionBox;
    return [
      bracket(i, i, 1, 1, long, c.primary, 26),
      bracket(w - i, i, -1, 1, long, c.primary, 26),
      bracket(i, h - i, 1, -1, long, c.primary, 26),
      bracket(w - i, h - i, -1, -1, long, c.primary, 26),
      bracket(inner, inner, 1, 1, short, c.accent, 8),
      bracket(w - inner, inner, -1, 1, short, c.accent, 8),
      bracket(inner, h - inner, 1, -1, short, c.accent, 8),
      bracket(w - inner, h - inner, -1, -1, short, c.accent, 8),
      box ? `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="14" fill="${c.primary}"/>` : '',
      box ? `<rect x="${box.x}" y="${box.y + box.height - 8}" width="${box.width}" height="8" rx="4" fill="${c.accent}"/>` : '',
    ].join('');
  },
});
