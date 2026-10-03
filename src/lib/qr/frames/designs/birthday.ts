import { mixHex } from '../color';
import { balloon, confettiPiece, edgePoints, seeded } from '../motifs';
import { defineFrame } from '../types';

const PARTY = ['#ffc83d', '#2ec4b6', '#ff6b9d', '#7b5cff'];

/** Bright border, confetti and balloons. */
export const birthdayFrame = defineFrame({
  id: 'birthday',
  label: 'Birthday',
  description: 'Confetti and balloons',
  occasion: 'celebration',
  defaultColor: '#e63e6d',
  defaultAccent: '#ff9f1c',
  defaultCaption: 'Happy Birthday!',
  caption: { font: 'montserrat', weight: 700, on: 'accent', charWidth: 0.68, maxSize: 54, widthFactor: 0.78 },
  paper: ({ accent }) => mixHex(accent, '#ffffff', 0.9),
  render: (c) => {
    const { width: w, height: h } = c;
    const random = seeded(2024);
    const colors = [c.primary, c.accent, ...PARTY];
    const box = c.captionBox;

    const confetti = edgePoints({ x: 46, y: 46, width: w - 92, height: h - 92 }, 40)
      .map((point, index) => {
        const size = 20 + random() * 14;
        const dx = (random() - 0.5) * 30;
        const dy = (random() - 0.5) * 30;
        return confettiPiece(index, point.x + dx, point.y + dy, size, colors[index % colors.length], random() * 360);
      })
      .join('');

    return [
      `<rect x="30" y="30" width="${w - 60}" height="${h - 60}" rx="60" fill="none" stroke="${c.primary}" stroke-width="12"/>`,
      `<rect x="54" y="54" width="${w - 108}" height="${h - 108}" rx="40" fill="none" stroke="${c.accent}" stroke-width="4" stroke-dasharray="2 16" stroke-linecap="round"/>`,
      confetti,
      balloon(54, 50, 68, c.primary, -14),
      balloon(w - 54, 50, 68, c.accent, 14),
      balloon(100, 36, 52, PARTY[1], 10),
      balloon(w - 100, 36, 52, PARTY[2], -10),
      box ? `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="${box.height / 2}" fill="${c.accent}"/>` : '',
    ].join('');
  },
});
