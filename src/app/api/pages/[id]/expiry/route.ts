import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { pageTemplates } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { getOwnedPage } from '@/lib/pages/get-owned-page';
import { ExpiryPageSchema, parseExpiry } from '@/lib/pages/schemas';

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;
  const owned = await getOwnedPage(id);
  if (!owned.ok) return owned.response;

  const body = await request.json().catch(() => null);
  const parsed = ExpiryPageSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid expiry data', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const expiry = parseExpiry(parsed.data.expiresAt);
  if (!expiry.ok) {
    return Response.json({ error: expiry.error, code: 'INVALID_EXPIRY' }, { status: 400 });
  }

  const expiresAt = expiry.value ?? null;

  await db
    .update(pageTemplates)
    .set({ expiresAt, updatedAt: new Date() })
    .where(eq(pageTemplates.id, id));

  await logActivity({
    userId: user.profile.id,
    action: 'page.expiry_changed',
    entityType: 'page',
    entityId: id,
    entityName: owned.page.name,
    details: { expiresAt: expiresAt?.toISOString() ?? null },
  });

  return Response.json({ expiresAt: expiresAt?.toISOString() ?? null });
}
