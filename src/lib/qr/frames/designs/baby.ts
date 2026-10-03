import { mixHex } from '../color';
import { cloud, edgePoints, heart, star } from '../motifs';
import { defineFrame } from '../types';

/** A soft scalloped border in two pastels, with clouds, stars and hearts. */
export const babyFrame = defineFrame({
  id: 'baby',
  label: 'Baby',
  description: 'Soft scallops, clouds and stars',
  occasion: 'celebration',
  defaultColor: '#9fd0e6',
  defaultAccent: '#ee86a6',
  defaultCaption: 'Welcome little one',
  caption: { font: 'lora', weight: 600, on: 'accent', charWidth: 0.58, maxSize: 52, widthFactor: 0.72 },
  paper: ({ primary }) => mixHex(primary, '#ffffff', 0.88),
  render: (c) => {
    const { width: w, height: h } = c;
    const box = c.captionBox;
    const midY = box ? box.y + box.height / 2 : h - 70;

    const scallops = edgePoints({ x: 34, y: 34, width: w - 68, height: h - 68 }, 50)
      .map((point, index) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="23" fill="${index % 2 === 0 ? c.primary : c.accent}"/>`)
      .join('');

    return [
      scallops,
      `<rect x="34" y="34" width="${w - 68}" height="${h - 68}" rx="20" fill="none" stroke="${c.paper}" stroke-width="22"/>`,
      `<rect x="62" y="62" width="${w - 124}" height="${h - 124}" rx="30" fill="none" stroke="${c.primary}" stroke-width="3" stroke-dasharray="1 12" stroke-linecap="round"/>`,
      star(w / 2 - 80, 54, 22, c.accent, -10),
      star(w / 2 + 80, 54, 22, c.accent, 10),
      heart(w / 2, 56, 36, c.accent),
      box ? `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="${box.height / 2}" fill="${c.accent}"/>` : '',
      box ? cloud(box.x - 56, midY + 4, 66, '#ffffff') : '',
      box ? cloud(box.x + box.width + 56, midY + 4, 66, '#ffffff') : '',
    ].join('');
  },
});
