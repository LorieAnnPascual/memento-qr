import { mixHex } from '../color';
import { paw, sidePoints } from '../motifs';
import { defineFrame } from '../types';

/** A trail of paw prints round a rounded border. */
export const petsFrame = defineFrame({
  id: 'pets',
  label: 'Pets',
  description: 'A trail of paw prints',
  occasion: 'pets',
  defaultColor: '#8a5a36',
  defaultAccent: '#f2994a',
  defaultCaption: 'Meet our pet',
  caption: { font: 'lora', weight: 600, on: 'accent', charWidth: 0.58, maxSize: 54, widthFactor: 0.7 },
  paper: ({ accent }) => mixHex(accent, '#ffffff', 0.9),
  render: (c) => {
    const { width: w, height: h } = c;
    const box = c.captionBox;
    const trailRect = { x: 46, y: 46, width: w - 92, height: h - 92 };
    const turn: Record<number, number> = { 0: 90, 90: 180, 180: 270, 270: 0 };

    const trail = sidePoints(trailRect, 84, 66, ['top', 'right', 'left'])
      .map((point, index) => {
        const side = index % 2 === 0 ? -9 : 9;
        const heading = turn[point.outward];
        const rad = (point.outward * Math.PI) / 180;
        // Step to alternate sides of the path, like left and right feet.
        const x = point.x + Math.cos(rad) * side;
        const y = point.y + Math.sin(rad) * side;
        return paw(x, y, 56, index % 2 === 0 ? c.primary : c.accent, heading);
      })
      .join('');

    const midY = box ? box.y + box.height / 2 : h - 60;
    return [
      `<rect x="14" y="14" width="${w - 28}" height="${h - 28}" rx="110" fill="none" stroke="${c.primary}" stroke-width="7"/>`,
      trail,
      box ? `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="${box.height / 2}" fill="${c.accent}"/>` : '',
      box ? paw(box.x - 70, midY, 72, c.primary, 70) : '',
      box ? paw(box.x + box.width + 70, midY, 72, c.primary, -70) : '',
    ].join('');
  },
});
