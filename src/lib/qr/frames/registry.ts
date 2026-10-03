import { babyFrame } from './designs/baby';
import { birthdayFrame } from './designs/birthday';
import { businessFrame } from './designs/business';
import { graduationFrame } from './designs/graduation';
import { memorialFrame } from './designs/memorial';
import { petsFrame } from './designs/pets';
import { simpleFrame } from './designs/simple';
import { weddingFrame } from './designs/wedding';
import type { FrameDefinition, FrameOccasion } from './types';

/**
 * Every frame design. To add one: write a design file in `designs/` (see simple.ts) and add
 * it to this list. Its `id` becomes a valid `FrameId` and it shows up in the picker.
 */
export const FRAMES = [
  simpleFrame,
  businessFrame,
  weddingFrame,
  birthdayFrame,
  graduationFrame,
  babyFrame,
  memorialFrame,
  petsFrame,
] as const;

export type FrameId = (typeof FRAMES)[number]['id'];

export const FRAME_IDS: readonly FrameId[] = FRAMES.map((frame) => frame.id);

export const OCCASION_LABELS: Record<FrameOccasion, string> = {
  everyday: 'Everyday',
  celebration: 'Celebrations',
  remembrance: 'Remembrance',
  pets: 'Pets',
};

/** The order the picker shows the groups in. */
export const OCCASION_ORDER: readonly FrameOccasion[] = ['everyday', 'celebration', 'remembrance', 'pets'];

const BY_ID = new Map<string, FrameDefinition>(FRAMES.map((frame) => [frame.id, frame as FrameDefinition]));

/** The design for an id, or null for anything unknown (an old or hand-edited value is simply ignored). */
export function getFrameDefinition(id: unknown): FrameDefinition | null {
  return typeof id === 'string' ? (BY_ID.get(id) ?? null) : null;
}

export function framesByOccasion(): { occasion: FrameOccasion; label: string; frames: FrameDefinition[] }[] {
  return OCCASION_ORDER.map((occasion) => ({
    occasion,
    label: OCCASION_LABELS[occasion],
    frames: FRAMES.filter((frame) => frame.occasion === occasion) as FrameDefinition[],
  })).filter((group) => group.frames.length > 0);
}
