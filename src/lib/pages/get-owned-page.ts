import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { pageTemplates, type PageTemplate } from '@/lib/db/schema';

export type OwnedPageResult =
  | { ok: true; page: PageTemplate }
  | { ok: false; response: Response };

/** Loads a team page for editing (system templates are never editable/publishable). Everyone on the team may edit any page. */
export async function getOwnedPage(id: string): Promise<OwnedPageResult> {
  const [page] = await db.select().from(pageTemplates).where(eq(pageTemplates.id, id)).limit(1);

  if (!page) {
    return {
      ok: false,
      response: Response.json({ error: 'Page not found', code: 'PAGE_NOT_FOUND' }, { status: 404 }),
    };
  }

  if (page.isSystem) {
    return {
      ok: false,
      response: Response.json(
        { error: 'Built-in templates cannot be modified', code: 'FORBIDDEN' },
        { status: 403 },
      ),
    };
  }

  return { ok: true, page };
}
