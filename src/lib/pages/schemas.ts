import { z } from 'zod';

import { PAGE_TEMPLATE_CATEGORIES } from './templates';

const MAX_PUCK_DATA_BYTES = 1_000_000;

const PuckDataSchema = z
  .object({
    root: z.record(z.string(), z.unknown()).optional(),
    content: z.array(z.record(z.string(), z.unknown())),
    zones: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((data) => JSON.stringify(data).length <= MAX_PUCK_DATA_BYTES, {
    message: 'Page design is too large',
  });

export const CreatePageSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(500).optional(),
  category: z.enum(PAGE_TEMPLATE_CATEGORIES).default('custom'),
  puckData: PuckDataSchema.optional(),
  /** Duplicate this page/template's design instead of starting blank. */
  fromTemplateId: z.string().uuid().optional(),
});

export const UpdatePageSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  category: z.enum(PAGE_TEMPLATE_CATEGORIES).optional(),
  puckData: PuckDataSchema.optional(),
});

export const PublishPageSchema = z.object({
  /** Omit to keep the current expiry; null to remove it; ISO string to set it. */
  expiresAt: z.string().nullable().optional(),
});

export const ExpiryPageSchema = z.object({
  expiresAt: z.string().nullable(),
});

/** Parses an optional ISO date; returns `undefined` when absent, `null` for null, or an Error message when invalid. */
export function parseExpiry(
  value: string | null | undefined,
): { ok: true; value: Date | null | undefined } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { ok: false, error: 'Invalid expiration date' };
  if (date <= new Date()) return { ok: false, error: 'Expiration date must be in the future' };
  return { ok: true, value: date };
}
