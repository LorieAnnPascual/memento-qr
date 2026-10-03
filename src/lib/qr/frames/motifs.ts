import type { Rect } from './types';

/**
 * Small vector shapes the frame designs are built from. All are simple geometry drawn
 * for this project (no third-party artwork). Every function returns SVG markup and takes
 * plain numbers and validated hex colours, so nothing here can carry untrusted text.
 */

/** Rounds to one decimal so the markup stays short. */
export function n(value: number): number {
  return Math.round(value * 10) / 10;
}

function place(x: number, y: number, rotation: number, scale: number): string {
  return `translate(${n(x)} ${n(y)}) rotate(${n(rotation)}) scale(${n(scale * 1000) / 1000})`;
}

export function heart(cx: number, cy: number, size: number, fill: string, rotation = 0): string {
  return `<path transform="${place(cx, cy, rotation, size / 2)}" fill="${fill}" d="M0 .95C-.25 .7-1 .2-1-.35-1-.75-.7-1-.4-1-.2-1-.05-.9 0-.7.05-.9.2-1 .4-1 .7-1 1-.75 1-.35 1 .2.25 .7 0 .95Z"/>`;
}

export function star(cx: number, cy: number, radius: number, fill: string, rotation = 0): string {
  const points = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 1 : 0.42;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    return `${n(Math.cos(angle) * r * 1000) / 1000},${n(Math.sin(angle) * r * 1000) / 1000}`;
  }).join(' ');
  return `<polygon transform="${place(cx, cy, rotation, radius)}" fill="${fill}" points="${points}"/>`;
}

/** A leaf growing from (x, y) in the direction `rotation` (0 points up). */
export function leaf(x: number, y: number, length: number, width: number, rotation: number, fill: string): string {
  return `<path transform="translate(${n(x)} ${n(y)}) rotate(${n(rotation)})" fill="${fill}" d="M0 0Q${n(width)} ${n(-length / 2)} 0 ${n(-length)}Q${n(-width)} ${n(-length / 2)} 0 0Z"/>`;
}

export function paw(cx: number, cy: number, size: number, fill: string, rotation = 0): string {
  const toes = [
    [-0.78, -0.12, -24],
    [-0.28, -0.62, -8],
    [0.28, -0.62, 8],
    [0.78, -0.12, 24],
  ]
    .map(([x, y, tilt]) => `<ellipse cx="${x}" cy="${y}" rx=".22" ry=".3" transform="rotate(${tilt} ${x} ${y})"/>`)
    .join('');
  return `<g transform="${place(cx, cy, rotation, size / 2)}" fill="${fill}"><path d="M0 -.05C.5 -.05 .85 .35 .85 .62 .85 .95 .5 .98 0 .8-.5 .98-.85 .95-.85 .62-.85 .35-.5 -.05 0 -.05Z"/>${toes}</g>`;
}

export function cloud(cx: number, cy: number, size: number, fill: string): string {
  return `<g transform="${place(cx, cy, 0, size / 2)}" fill="${fill}"><circle cx="-.5" cy=".1" r=".45"/><circle cx="0" cy="-.15" r=".6"/><circle cx=".55" cy=".1" r=".45"/><rect x="-.95" y=".1" width="1.95" height=".45" rx=".225"/></g>`;
}

/** A party balloon with its knot and a curly string, `size` is the balloon's width. */
export function balloon(cx: number, cy: number, size: number, fill: string, rotation = 0): string {
  return `<g transform="${place(cx, cy, rotation, size)}"><path d="M0 .62C-.08 .85 .08 1.05 0 1.4" fill="none" stroke="${fill}" stroke-width=".04" stroke-linecap="round"/><path d="M0 .6 -.07 .72H.07Z" fill="${fill}"/><ellipse cx="0" cy="0" rx=".5" ry=".62" fill="${fill}"/><ellipse cx="-.18" cy="-.24" rx=".08" ry=".15" fill="#fff" fill-opacity=".55" transform="rotate(25 -.18 -.24)"/></g>`;
}

export function dot(cx: number, cy: number, radius: number, fill: string): string {
  return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(radius)}" fill="${fill}"/>`;
}

export function confettiPiece(kind: number, cx: number, cy: number, size: number, fill: string, rotation: number): string {
  const s = size / 2;
  const shape =
    kind % 3 === 0
      ? `<rect x="${n(-s)}" y="${n(-s / 2.5)}" width="${n(size)}" height="${n(size / 2.5)}" rx="${n(size / 10)}"/>`
      : kind % 3 === 1
        ? `<circle r="${n(s * 0.7)}"/>`
        : `<path d="M0 ${n(-s)}L${n(s)} ${n(s * 0.8)}H${n(-s)}Z"/>`;
  return `<g transform="translate(${n(cx)} ${n(cy)}) rotate(${n(rotation)})" fill="${fill}">${shape}</g>`;
}

/** Two linked wedding rings with a small stone. */
export function rings(cx: number, cy: number, radius: number, stroke: string, gem: string): string {
  const w = n(radius * 0.28);
  return `<g fill="none" stroke="${stroke}" stroke-width="${w}"><circle cx="${n(cx - radius * 0.6)}" cy="${n(cy)}" r="${n(radius)}"/><circle cx="${n(cx + radius * 0.6)}" cy="${n(cy)}" r="${n(radius)}"/></g><path d="M${n(cx)} ${n(cy - radius * 1.55)}l${n(radius * 0.32)} ${n(radius * 0.38)}-${n(radius * 0.32)} ${n(radius * 0.38)}-${n(radius * 0.32)}-${n(radius * 0.38)}Z" fill="${gem}"/>`;
}

/** A simple flower: `petals` ellipses round a centre. */
export function flower(cx: number, cy: number, radius: number, petals: number, petal: string, centre: string): string {
  const items = Array.from({ length: petals }, (_, i) => {
    const angle = (360 / petals) * i;
    return `<ellipse cx="0" cy="${n(-radius * 0.55)}" rx="${n(radius * 0.3)}" ry="${n(radius * 0.52)}" transform="rotate(${n(angle)})"/>`;
  }).join('');
  return `<g transform="translate(${n(cx)} ${n(cy)})"><g fill="${petal}">${items}</g><circle r="${n(radius * 0.22)}" fill="${centre}"/></g>`;
}

/** A graduation cap (mortarboard) with a tassel, centred on (cx, cy). */
export function gradCap(cx: number, cy: number, width: number, fill: string, tassel: string): string {
  const s = width / 100;
  return `<g transform="translate(${n(cx)} ${n(cy)}) scale(${n(s * 1000) / 1000})"><path d="M-28 6V26C-14 38 14 38 28 26V6L0 18Z" fill="${fill}"/><path d="M0 -22L50 -2 0 18-50 -2Z" fill="${fill}"/><path d="M0 -22L50 -2 0 18-50 -2Z" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"/><path d="M42 1V28" stroke="${tassel}" stroke-width="4" stroke-linecap="round"/><circle cx="42" cy="31" r="5" fill="${tassel}"/></g>`;
}

export interface PathPoint {
  x: number;
  y: number;
  /** Direction pointing away from the picture's centre, in degrees (0 = up, 90 = right). */
  outward: number;
}

/** Evenly spaced points along the straight sides of a rectangle, leaving `corner` clear at each end. */
export function sidePoints(rect: Rect, step: number, corner: number, sides: ('top' | 'right' | 'bottom' | 'left')[]): PathPoint[] {
  const points: PathPoint[] = [];
  const along = (from: number, to: number): number[] => {
    const length = to - from;
    const count = Math.max(1, Math.floor(length / step));
    const gap = length / count;
    return Array.from({ length: count }, (_, i) => from + gap * (i + 0.5));
  };
  const { x, y, width, height } = rect;
  if (sides.includes('top')) for (const px of along(x + corner, x + width - corner)) points.push({ x: px, y, outward: 0 });
  if (sides.includes('right')) for (const py of along(y + corner, y + height - corner)) points.push({ x: x + width, y: py, outward: 90 });
  if (sides.includes('bottom')) for (const px of along(x + corner, x + width - corner)) points.push({ x: px, y: y + height, outward: 180 });
  if (sides.includes('left')) for (const py of along(y + corner, y + height - corner)) points.push({ x, y: py, outward: 270 });
  return points;
}

/** A repeatable pseudo-random number generator, so a design looks the same every time it is drawn. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Points along a gentle curve from `from` to `to` bulging by `bend`, with leaves on both sides: a laurel sprig. */
export function sprig(
  from: { x: number; y: number },
  to: { x: number; y: number },
  bend: number,
  pairs: number,
  leafLength: number,
  leafColor: string,
  stemColor: string,
): string {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const cx = mx + (-dy / length) * bend;
  const cy = my + (dx / length) * bend;

  const at = (t: number): { x: number; y: number; angle: number } => {
    const x = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * cx + t * t * to.x;
    const y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * cy + t * t * to.y;
    const tx = 2 * (1 - t) * (cx - from.x) + 2 * t * (to.x - cx);
    const ty = 2 * (1 - t) * (cy - from.y) + 2 * t * (to.y - cy);
    return { x, y, angle: (Math.atan2(tx, -ty) * 180) / Math.PI };
  };

  const leaves: string[] = [];
  for (let i = 0; i < pairs; i += 1) {
    const point = at((i + 0.6) / (pairs + 0.4));
    leaves.push(leaf(point.x, point.y, leafLength, leafLength * 0.22, point.angle - 48, leafColor));
    leaves.push(leaf(point.x, point.y, leafLength, leafLength * 0.22, point.angle + 48, leafColor));
  }
  const tip = at(1);
  leaves.push(leaf(tip.x, tip.y, leafLength * 1.05, leafLength * 0.24, tip.angle, leafColor));

  return `<path d="M${n(from.x)} ${n(from.y)}Q${n(cx)} ${n(cy)} ${n(to.x)} ${n(to.y)}" fill="none" stroke="${stemColor}" stroke-width="3" stroke-linecap="round"/>${leaves.join('')}`;
}

/** Points spread along all four sides of a rectangle, starting at each corner (clockwise), about `step` apart. */
export function edgePoints(rect: Rect, step: number): { x: number; y: number }[] {
  const { x, y, width, height } = rect;
  const across = Math.max(1, Math.round(width / step));
  const down = Math.max(1, Math.round(height / step));
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < across; i += 1) points.push({ x: x + (width / across) * i, y });
  for (let i = 0; i < down; i += 1) points.push({ x: x + width, y: y + (height / down) * i });
  for (let i = 0; i < across; i += 1) points.push({ x: x + width - (width / across) * i, y: y + height });
  for (let i = 0; i < down; i += 1) points.push({ x, y: y + height - (height / down) * i });
  return points;
}
