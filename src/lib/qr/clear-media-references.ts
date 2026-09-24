import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';

/**
 * Removes a deleted media file's URL from any `style_config` that still
 * references it (as a QR logo or a card background image), on both QR codes
 * and templates owned by the same user. Without this, deleting a file from
 * the Media library leaves dangling references — the saved design keeps
 * "showing" the logo/background until the URL 404s, and even then the field
 * is never cleared. Page builder designs owned by the user are cleared too.
 *
 * Drizzle's query builder has no jsonb key-removal helper, so this uses
 * Postgres's `-` operator directly. Each field is removed independently so a
 * row referencing two different files only loses the one that matches.
 */
export async function clearMediaReferences(publicUrl: string, userProfileId: string): Promise<void> {
  await Promise.all([
    db.execute(sql`
      UPDATE qr_codes
      SET style_config = style_config - 'logoUrl', updated_at = now()
      WHERE user_id = ${userProfileId} AND style_config ->> 'logoUrl' = ${publicUrl}
    `),
    db.execute(sql`
      UPDATE qr_codes
      SET style_config = style_config - 'cardBackgroundImage', updated_at = now()
      WHERE user_id = ${userProfileId} AND style_config ->> 'cardBackgroundImage' = ${publicUrl}
    `),
    db.execute(sql`
      UPDATE qr_templates
      SET style_config = style_config - 'logoUrl', updated_at = now()
      WHERE user_id = ${userProfileId} AND style_config ->> 'logoUrl' = ${publicUrl}
    `),
    db.execute(sql`
      UPDATE qr_templates
      SET style_config = style_config - 'cardBackgroundImage', updated_at = now()
      WHERE user_id = ${userProfileId} AND style_config ->> 'cardBackgroundImage' = ${publicUrl}
    `),
    // Page builder designs keep image URLs at many depths (hero, gallery items,
    // page background), so blank the URL wherever it appears; an empty image
    // value renders as "no image".
    db.execute(sql`
      UPDATE page_templates
      SET puck_data = replace(puck_data::text, to_jsonb(${publicUrl}::text)::text, '""')::jsonb, updated_at = now()
      WHERE user_id = ${userProfileId} AND puck_data::text LIKE ${'%' + publicUrl + '%'}
    `),
  ]);
}
