import { z } from 'zod';

import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { getOwnedPage } from '@/lib/pages/get-owned-page';
import { addForward, listForwards, removeForward } from '@/lib/slugs/forwards';

type RouteContext = { params: Promise<{ id: string }> };

const AddSchema = z.object({ slug: z.string().max(100) });

/** The old links forwarded to this page. */
export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();
  if (!user?.profile) return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await params;
  const owned = await getOwnedPage(id);
  if (!owned.ok) return owned.response;

  return Response.json({ forwards: await listForwards('page', id) });
}

/** Forwards an old link to this page (a permanent redirect). Page names are freed when a page is deleted, so there is nothing to reclaim. */
export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();
  if (!user?.profile) return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await params;
  const owned = await getOwnedPage(id);
  if (!owned.ok) return owned.response;
  const { page } = owned;

  const parsed = AddSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Enter the old link name', code: 'VALIDATION_ERROR' }, { status: 400 });

  if (!page.shortCode) {
    return Response.json({ error: 'Publish this page first, so it has a link to forward to.', code: 'NO_LINK' }, { status: 400 });
  }

  const added = await addForward('page', id, parsed.data.slug, false);
  if (!added.ok) return added.response;

  await logActivity({
    userId: user.profile.id,
    action: 'page.updated',
    entityType: 'page',
    entityId: id,
    entityName: page.name,
    details: { forwardAdded: added.code },
  });

  return Response.json({ code: added.code, forwards: await listForwards('page', id) }, { status: 201 });
}

/** Stops forwarding an old link (`?code=old-name`). */
export async function DELETE(request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();
  if (!user?.profile) return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await params;
  const owned = await getOwnedPage(id);
  if (!owned.ok) return owned.response;

  const code = new URL(request.url).searchParams.get('code')?.toLowerCase() ?? '';
  if (!code || !(await removeForward('page', id, code))) {
    return Response.json({ error: 'That link is not forwarded to this page', code: 'FORWARD_NOT_FOUND' }, { status: 404 });
  }

  await logActivity({
    userId: user.profile.id,
    action: 'page.updated',
    entityType: 'page',
    entityId: id,
    entityName: owned.page.name,
    details: { forwardRemoved: code },
  });

  return Response.json({ removed: code, forwards: await listForwards('page', id) });
}
