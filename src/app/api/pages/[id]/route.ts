import { and, eq, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import { pageTemplates } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { getOwnedPage } from '@/lib/pages/get-owned-page';
import { UpdatePageSchema } from '@/lib/pages/schemas';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;

  const [page] = await db
    .select()
    .from(pageTemplates)
    .where(
      and(
        eq(pageTemplates.id, id),
        or(eq(pageTemplates.isPublic, true), eq(pageTemplates.userId, user.profile.id)),
      ),
    )
    .limit(1);

  if (!page) {
    return Response.json({ error: 'Page not found', code: 'PAGE_NOT_FOUND' }, { status: 404 });
  }

  return Response.json(page);
}

export async function PUT(request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;
  const owned = await getOwnedPage(id, user.profile.id);
  if (!owned.ok) return owned.response;

  const body = await request.json().catch(() => null);
  const parsed = UpdatePageSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid page data', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const [updated] = await db
    .update(pageTemplates)
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.puckData !== undefined && { puckData: data.puckData }),
      updatedAt: new Date(),
    })
    .where(eq(pageTemplates.id, id))
    .returning();

  // Autosaves are frequent; fold repeats into one entry.
  await logActivity({
    userId: user.profile.id,
    action: 'page.updated',
    entityType: 'page',
    entityId: id,
    entityName: updated.name,
    collapseWithinMs: 10 * 60 * 1000,
  });

  return Response.json(updated);
}

export async function DELETE(_request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;
  const owned = await getOwnedPage(id, user.profile.id);
  if (!owned.ok) return owned.response;

  await db.delete(pageTemplates).where(eq(pageTemplates.id, id));

  await logActivity({
    userId: user.profile.id,
    action: 'page.deleted',
    entityType: 'page',
    entityId: id,
    entityName: owned.page.name,
  });

  return new Response(null, { status: 204 });
}
