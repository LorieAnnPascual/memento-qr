import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { buildMediaUrl, storagePathFromMediaUrl } from '@/lib/upload/media-types';

/**
 * Removes a deleted media file's URL from any `style_config` that still
 * references it (as a QR logo or a card background image), on both QR codes
 * and templates. Without this, deleting a file from
 * the Media library leaves dangling references — the saved design keeps
 * "showing" the logo/background until the URL 404s, and even then the field
 * is never cleared. Page builder designs are cleared too.
 *
 * Drizzle's query builder has no jsonb key-removal helper, so this uses
 * Postgres's `-` operator directly. Each field is removed independently so a
 * row referencing two different files only loses the one that matches.
 */
export async function clearMediaReferences(publicUrl: string): Promise<void> {
  // A video may be referenced by its own-domain address or by an older storage address.
  const storagePath = storagePathFromMediaUrl(publicUrl);
  const videoUrls = [...new Set(storagePath ? [publicUrl, buildMediaUrl(storagePath)] : [publicUrl])];

  await Promise.all([
    // A video QR code points straight at its file, so it has nothing left to play: clear the
    // target (the scan then answers "Destination Unavailable" instead of erroring).
    db.execute(sql`
      UPDATE qr_codes
      SET target_url = NULL, payload_fields = payload_fields - 'videoUrl', updated_at = now()
      WHERE qr_type = 'video' AND target_url IN (${sql.join(
        videoUrls.map((url) => sql`${url}`),
        sql`, `,
      )})
    `),
    db.execute(sql`
      UPDATE qr_codes
      SET style_config = style_config - 'logoUrl', updated_at = now()
      WHERE style_config ->> 'logoUrl' = ${publicUrl}
    `),
    db.execute(sql`
      UPDATE qr_codes
      SET style_config = style_config - 'cardBackgroundImage', updated_at = now()
      WHERE style_config ->> 'cardBackgroundImage' = ${publicUrl}
    `),
    db.execute(sql`
      UPDATE qr_templates
      SET style_config = style_config - 'logoUrl', updated_at = now()
      WHERE style_config ->> 'logoUrl' = ${publicUrl}
    `),
    db.execute(sql`
      UPDATE qr_templates
      SET style_config = style_config - 'cardBackgroundImage', updated_at = now()
      WHERE style_config ->> 'cardBackgroundImage' = ${publicUrl}
    `),
    // Page builder designs keep image URLs at many depths (hero, gallery items,
    // page background), so blank the URL wherever it appears; an empty image
    // value renders as "no image".
    db.execute(sql`
      UPDATE page_templates
      SET puck_data = replace(puck_data::text, to_jsonb(${publicUrl}::text)::text, '""')::jsonb, updated_at = now()
      WHERE puck_data::text LIKE ${'%' + publicUrl + '%'}
    `),
  ]);
}
