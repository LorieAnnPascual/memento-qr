import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { pageTemplates } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { getOwnedPage } from '@/lib/pages/get-owned-page';
import { buildPublishedUrl } from '@/lib/pages/page-status';
import { parseExpiry, PublishPageSchema } from '@/lib/pages/schemas';
import { generateShortCode } from '@/lib/qr/short-code';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;
  const owned = await getOwnedPage(id);
  if (!owned.ok) return owned.response;
  const { page } = owned;

  const body = await request.json().catch(() => ({}));
  const parsed = PublishPageSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid publish data', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const expiry = parseExpiry(parsed.data.expiresAt);
  if (!expiry.ok) {
    return Response.json({ error: expiry.error, code: 'INVALID_EXPIRY' }, { status: 400 });
  }

  // Omitted → keep the current expiry, unless it already passed (re-publishing
  // an expired page with a stale date would make it expire instantly).
  const stillValid = page.expiresAt && new Date(page.expiresAt) > new Date() ? page.expiresAt : null;
  const expiresAt = expiry.value === undefined ? stillValid : expiry.value;

  // Reuse the short code so a re-published page keeps its URL.
  const shortCode = page.shortCode ?? generateShortCode();

  await db
    .update(pageTemplates)
    .set({
      isPublished: true,
      shortCode,
      publishedAt: page.publishedAt ?? new Date(),
      expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(pageTemplates.id, id));

  await logActivity({
    userId: user.profile.id,
    action: 'page.published',
    entityType: 'page',
    entityId: id,
    entityName: page.name,
    details: { expiresAt: expiresAt?.toISOString() ?? null },
  });

  return Response.json({
    published: true,
    shortCode,
    url: buildPublishedUrl(shortCode),
    expiresAt: expiresAt?.toISOString() ?? null,
  });
}

export async function DELETE(_request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;
  const owned = await getOwnedPage(id);
  if (!owned.ok) return owned.response;

  // The short code is preserved so re-publishing restores the same URL.
  await db
    .update(pageTemplates)
    .set({ isPublished: false, updatedAt: new Date() })
    .where(eq(pageTemplates.id, id));

  await logActivity({
    userId: user.profile.id,
    action: 'page.unpublished',
    entityType: 'page',
    entityId: id,
    entityName: owned.page.name,
  });

  return Response.json({ published: false });
}
