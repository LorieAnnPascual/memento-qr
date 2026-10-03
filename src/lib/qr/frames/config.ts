import { safeHex } from './color';
import { FRAMES, getFrameDefinition, type FrameId } from './registry';
import type { FrameDefinition } from './types';

/** What is stored in a code's `style_config.frame`. Everything but `id` is optional. */
export interface FrameConfig {
  id: FrameId;
  /** Main colour (border, caption shape). Falls back to the design's own. */
  color?: string;
  accentColor?: string;
  /** Undefined means the design's own caption; an empty string means no caption. */
  caption?: string;
}

export const MAX_CAPTION_LENGTH = 24;

/** Characters XML 1.0 cannot hold (control characters, lone surrogates, U+FFFE and U+FFFF). */
const INVALID_XML = new RegExp(
  '[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]',
  'g',
);

/** One tidy line of at most 24 characters, safe to place in SVG text. (Escaping for markup happens where it is written.) */
export function cleanCaption(value: string): string {
  return Array.from(value.replace(INVALID_XML, '').replace(/\s+/g, ' ').trim())
    .slice(0, MAX_CAPTION_LENGTH)
    .join('');
}

export interface ResolvedFrame {
  definition: FrameDefinition;
  primary: string;
  accent: string;
  /** The caption to draw, or '' for none. */
  caption: string;
}

/** The design plus the colours and caption actually used, or null when there is no (known) frame. */
export function resolveFrame(frame: unknown): ResolvedFrame | null {
  if (typeof frame !== 'object' || frame === null) return null;
  const { id, color, accentColor, caption } = frame as Record<string, unknown>;
  const definition = getFrameDefinition(id);
  if (!definition) return null;

  return {
    definition,
    primary: safeHex(color, definition.defaultColor),
    accent: safeHex(accentColor, definition.defaultAccent),
    caption: typeof caption === 'string' ? cleanCaption(caption) : definition.defaultCaption,
  };
}

/** A frame config for a design with its own colours and caption (what picking it in the designer stores). */
export function defaultFrameConfig(id: FrameId): FrameConfig {
  const definition = FRAMES.find((frame) => frame.id === id);
  return {
    id,
    color: definition?.defaultColor,
    accentColor: definition?.defaultAccent,
    caption: definition?.defaultCaption,
  };
}
