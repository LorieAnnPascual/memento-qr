import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { pageTemplates, type PageTemplate } from '@/lib/db/schema';

export type OwnedPageResult =
  | { ok: true; page: PageTemplate }
  | { ok: false; response: Response };

/** Loads a page and confirms the current user owns it (system templates are never editable/publishable). */
export async function getOwnedPage(id: string, userProfileId: string): Promise<OwnedPageResult> {
  const [page] = await db.select().from(pageTemplates).where(eq(pageTemplates.id, id)).limit(1);

  if (!page) {
    return {
      ok: false,
      response: Response.json({ error: 'Page not found', code: 'PAGE_NOT_FOUND' }, { status: 404 }),
    };
  }

  if (page.isSystem || page.userId !== userProfileId) {
    return {
      ok: false,
      response: Response.json(
        { error: 'You can only modify your own pages', code: 'FORBIDDEN' },
        { status: 403 },
      ),
    };
  }

  return { ok: true, page };
}
