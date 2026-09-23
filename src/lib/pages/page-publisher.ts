import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { pageTemplates } from '@/lib/db/schema';
import { toPublishStatus, type PublishedPageStatus } from './page-status';

export { buildPublishedUrl, toPublishStatus, type PublishedPageStatus } from './page-status';

export async function getPublishStatus(pageId: string): Promise<PublishedPageStatus | null> {
  const [page] = await db
    .select({
      isPublished: pageTemplates.isPublished,
      shortCode: pageTemplates.shortCode,
      publishedAt: pageTemplates.publishedAt,
      expiresAt: pageTemplates.expiresAt,
    })
    .from(pageTemplates)
    .where(eq(pageTemplates.id, pageId))
    .limit(1);

  return page ? toPublishStatus(page) : null;
}
