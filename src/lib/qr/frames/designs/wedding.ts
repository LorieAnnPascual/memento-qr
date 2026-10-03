import { mixHex } from '../color';
import { heart, rings } from '../motifs';
import { defineFrame } from '../types';

/** Two thin borders, hearts in the corners, interlocked rings and an italic caption. */
export const weddingFrame = defineFrame({
  id: 'wedding',
  label: 'Wedding',
  description: 'Double border, hearts and rings',
  occasion: 'celebration',
  defaultColor: '#a8803f',
  defaultAccent: '#d98c9a',
  defaultCaption: 'Scan for our story',
  caption: { font: 'garamond', weight: 500, italic: true, on: 'paper', charWidth: 0.4, maxSize: 70, widthFactor: 0.8 },
  paper: ({ accent }) => mixHex(accent, '#ffffff', 0.9),
  render: (c) => {
    const { width: w, height: h } = c;
    const outer = 28;
    const inner = 50;
    const box = c.captionBox;
    const corner = 56;

    const badge = (x: number, y: number): string =>
      `<circle cx="${x}" cy="${y}" r="28" fill="${c.paper}"/>${heart(x, y, 40, c.accent)}`;

    return [
      `<rect x="${outer}" y="${outer}" width="${w - outer * 2}" height="${h - outer * 2}" rx="90" fill="none" stroke="${c.primary}" stroke-width="5"/>`,
      `<rect x="${inner}" y="${inner}" width="${w - inner * 2}" height="${h - inner * 2}" rx="70" fill="none" stroke="${c.primary}" stroke-width="2.5"/>`,
      badge(corner, corner),
      badge(w - corner, corner),
      badge(corner, h - corner),
      badge(w - corner, h - corner),
      `<rect x="${w / 2 - 105}" y="8" width="210" height="${c.plate.y - 14}" fill="${c.paper}"/>`,
      rings(w / 2, 52, 22, c.primary, c.accent),
      box ? heart(box.x + 26, box.y + box.height / 2, 38, c.accent) : '',
      box ? heart(box.x + box.width - 26, box.y + box.height / 2, 38, c.accent) : '',
    ].join('');
  },
});
