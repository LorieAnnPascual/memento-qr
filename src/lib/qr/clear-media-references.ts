import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';

/**
 * Removes a deleted media file's URL from any `style_config` that still
 * references it (as a QR logo or a card background image), on both QR codes
 * and templates owned by the same user. Without this, deleting a file from
 * the Media library leaves dangling references — the saved design keeps
 * "showing" the logo/background until the URL 404s, and even then the field
 * is never cleared.
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
  ]);
}
