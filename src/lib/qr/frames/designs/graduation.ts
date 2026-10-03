import { mixHex } from '../color';
import { gradCap, star } from '../motifs';
import { defineFrame } from '../types';

/** A formal double border, gold stars, a graduation cap and a dark caption bar. */
export const graduationFrame = defineFrame({
  id: 'graduation',
  label: 'Graduation',
  description: 'Cap, stars and a double border',
  occasion: 'celebration',
  defaultColor: '#1e3a5f',
  defaultAccent: '#d6a419',
  defaultCaption: 'Congratulations!',
  caption: { font: 'playfair', weight: 600, on: 'primary', charWidth: 0.56, maxSize: 54, widthFactor: 0.82 },
  paper: ({ accent }) => mixHex(accent, '#ffffff', 0.93),
  render: (c) => {
    const { width: w, height: h } = c;
    const box = c.captionBox;
    const corner = 46;

    const badge = (x: number, y: number): string =>
      `<circle cx="${x}" cy="${y}" r="30" fill="${c.paper}"/>${star(x, y, 25, c.accent)}`;

    return [
      `<rect x="30" y="30" width="${w - 60}" height="${h - 60}" rx="22" fill="none" stroke="${c.primary}" stroke-width="14"/>`,
      `<rect x="54" y="54" width="${w - 108}" height="${h - 108}" rx="8" fill="none" stroke="${c.accent}" stroke-width="4"/>`,
      badge(corner, corner),
      badge(w - corner, corner),
      badge(corner, h - corner),
      badge(w - corner, h - corner),
      `<rect x="${w / 2 - 100}" y="8" width="200" height="${c.plate.y - 12}" fill="${c.paper}"/>`,
      gradCap(w / 2, 44, 150, c.primary, c.accent),
      box ? `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="12" fill="${c.primary}"/>` : '',
      box ? `<rect x="${box.x + 14}" y="${box.y + box.height - 12}" width="${box.width - 28}" height="3" rx="1.5" fill="${c.accent}"/>` : '',
    ].join('');
  },
});
