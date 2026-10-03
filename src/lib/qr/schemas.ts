import { z } from 'zod';

import { QR_TYPES } from '@/types/qr';

// Generous for any real design, small enough that one request cannot fill the database.
const MAX_STYLE_BYTES = 500_000;
const MAX_FIELDS_BYTES = 100_000;

function withinBytes(limit: number): (value: unknown) => boolean {
  return (value) => JSON.stringify(value).length <= limit;
}

/** Video codes play a hosted file at their /q/ link, so there is no static form of them. */
export function VIDEO_MUST_BE_DYNAMIC_RESPONSE(): Response {
  return Response.json(
    { error: 'Video QR codes are always dynamic.', code: 'VIDEO_MUST_BE_DYNAMIC' },
    { status: 400 },
  );
}

/** A video code's target must be a video from our own Media library, checked when it is saved. */
export function INVALID_VIDEO_RESPONSE(): Response {
  return Response.json(
    { error: 'Choose a video from your Media library or upload one.', code: 'INVALID_VIDEO' },
    { status: 400 },
  );
}

export const CreateQRSchema = z.object({
  name: z.string().trim().min(1).max(200),
  qrType: z.enum(QR_TYPES),
  payload: z.string().min(1).max(4096),
  payloadFields: z.record(z.string(), z.unknown()).refine(withinBytes(MAX_FIELDS_BYTES), 'Too large').optional(),
  styleConfig: z.record(z.string(), z.unknown()).refine(withinBytes(MAX_STYLE_BYTES), 'Too large'),
  // No `.default(false)` here — `UpdateQRSchema` is `.partial()` on this
  // same schema, and a zod default still fires for a key that's absent from
  // the input even under `.partial()`. That would make every partial update
  // that doesn't mention `isDynamic` look like an explicit "turn off"
  // request. Callers that need the create-time default apply `?? false`.
  isDynamic: z.boolean().optional(),
  /** A link name chosen by the team for a dynamic code (`/q/ana-memorial`); blank or omitted keeps the current / a random one. */
  slug: z.string().max(100).optional(),
  // Not restricted to `.url()` — a dynamic QR's target can be any absolute
  // URI (mailto:, tel:, etc.), not just http(s).
  targetUrl: z.string().min(1).max(2000).optional(),
  expiresAt: z.string().nullable().optional(),
  scanLimit: z.number().int().positive().nullable().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().max(2000).optional(),
  folderId: z.string().uuid().nullable().optional(),
});

export const UpdateQRSchema = CreateQRSchema.partial().extend({
  isPaused: z.boolean().optional(),
});

export const TEMPLATE_CATEGORIES = [
  'general',
  'memorial',
  'business',
  'pet',
  'event',
  'social',
  'custom',
] as const;

export const CreateTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(500).optional(),
  category: z.enum(TEMPLATE_CATEGORIES).default('custom'),
  styleConfig: z.record(z.string(), z.unknown()).refine(withinBytes(MAX_STYLE_BYTES), 'Too large'),
});

export const UpdateTemplateSchema = CreateTemplateSchema.partial();
