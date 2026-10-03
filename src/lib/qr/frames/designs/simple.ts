import { defineFrame } from '../types';

/** A clean rounded border with a caption pill: fits anything. */
export const simpleFrame = defineFrame({
  id: 'simple',
  label: 'Simple',
  description: 'Rounded border and a caption pill',
  occasion: 'everyday',
  defaultColor: '#23334e',
  defaultAccent: '#c9a24d',
  defaultCaption: 'Scan me',
  caption: { font: 'inter', weight: 600, on: 'primary', charWidth: 0.6, maxSize: 54, widthFactor: 0.62 },
  render: (c) => {
    const { inset: i, width: w, height: h } = c;
    const box = c.captionBox;
    return [
      `<rect x="${i}" y="${i}" width="${w - i * 2}" height="${h - i * 2}" rx="70" fill="none" stroke="${c.primary}" stroke-width="14"/>`,
      `<rect x="${i + 26}" y="${i + 26}" width="${w - (i + 26) * 2}" height="${h - (i + 26) * 2}" rx="46" fill="none" stroke="${c.accent}" stroke-width="4"/>`,
      box ? `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="${box.height / 2}" fill="${c.primary}"/>` : '',
    ].join('');
  },
});
