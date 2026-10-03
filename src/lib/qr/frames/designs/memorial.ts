import { mixHex } from '../color';
import { flower, sprig } from '../motifs';
import { defineFrame } from '../types';

/** A quiet, soft double border with laurel sprigs and a small flower. */
export const memorialFrame = defineFrame({
  id: 'memorial',
  label: 'Memorial',
  description: 'Soft double border, laurel and a flower',
  occasion: 'remembrance',
  defaultColor: '#4a5568',
  defaultAccent: '#7d9473',
  defaultCaption: 'In loving memory',
  caption: { font: 'garamond', weight: 400, italic: true, on: 'paper', charWidth: 0.4, maxSize: 66, widthFactor: 0.7 },
  paper: ({ primary }) => mixHex(primary, '#ffffff', 0.94),
  render: (c) => {
    const { width: w, height: h } = c;
    const soft = mixHex(c.primary, c.paper, 0.35);
    const box = c.captionBox;
    const y = box ? box.y + box.height / 2 : h - 70;
    const leaves = mixHex(c.accent, c.paper, 0.15);

    return [
      `<rect x="30" y="30" width="${w - 60}" height="${h - 60}" rx="60" fill="none" stroke="${c.primary}" stroke-width="4"/>`,
      `<rect x="52" y="52" width="${w - 104}" height="${h - 104}" rx="42" fill="none" stroke="${soft}" stroke-width="3"/>`,
      `<rect x="${w / 2 - 70}" y="6" width="140" height="${c.plate.y - 16}" fill="${c.paper}"/>`,
      flower(w / 2, 48, 42, 6, c.accent, c.primary),
      box ? sprig({ x: 74, y: y + 8 }, { x: box.x - 22, y: y - 12 }, -14, 5, 46, leaves, c.accent) : '',
      box ? sprig({ x: w - 74, y: y + 8 }, { x: box.x + box.width + 22, y: y - 12 }, 14, 5, 46, leaves, c.accent) : '',
    ].join('');
  },
});
