import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { pageTemplates, type NewPageTemplate } from '@/lib/db/schema';
import { recordRename } from '@/lib/slugs/slugs';

/**
 * Gives a page its link name. If it already had a different one, that old name is kept
 * as an alias in the same transaction, so links people already shared keep working.
 * `extra` lets the publish route set its own fields in the same update.
 */
export async function savePageShortCode(
  pageId: string,
  oldCode: string | null,
  newCode: string,
  extra: Partial<NewPageTemplate> = {},
): Promise<void> {
  const update = (executor: Pick<typeof db, 'update'>) =>
    executor
      .update(pageTemplates)
      .set({ ...extra, shortCode: newCode, updatedAt: new Date() })
      .where(eq(pageTemplates.id, pageId));

  if (oldCode && oldCode !== newCode) {
    await db.transaction(async (tx) => {
      await update(tx);
      await recordRename(tx, 'page', pageId, oldCode, newCode);
    });
    return;
  }
  await update(db);
}
