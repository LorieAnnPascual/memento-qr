import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { qrCodes } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { addForward, listForwards, removeForward } from '@/lib/slugs/forwards';

type RouteContext = { params: Promise<{ id: string }> };

const AddSchema = z.object({
  slug: z.string().max(100),
  reclaimDeletedLink: z.boolean().optional(),
});

async function loadQr(id: string) {
  const [qr] = await db
    .select({ id: qrCodes.id, name: qrCodes.name, shortCode: qrCodes.shortCode, isDynamic: qrCodes.isDynamic })
    .from(qrCodes)
    .where(and(eq(qrCodes.id, id), isNull(qrCodes.deletedAt)))
    .limit(1);
  return qr;
}

const notFound = (): Response => Response.json({ error: 'QR code not found', code: 'QR_NOT_FOUND' }, { status: 404 });

/** The old links forwarded to this QR code. */
export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();
  if (!user?.profile) return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await params;
  if (!(await loadQr(id))) return notFound();

  return Response.json({ forwards: await listForwards('qr', id) });
}

/** Forwards an old link (for example one left by a deleted code) to this QR code with a 301. */
export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();
  if (!user?.profile) return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await params;
  const qr = await loadQr(id);
  if (!qr) return notFound();

  const parsed = AddSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Enter the old link name', code: 'VALIDATION_ERROR' }, { status: 400 });

  // The old link is sent to this code's link, so the code needs one.
  if (!qr.isDynamic || !qr.shortCode) {
    return Response.json(
      { error: 'Make this code dynamic and save it first, so it has a link to forward to.', code: 'NO_LINK' },
      { status: 400 },
    );
  }

  const added = await addForward('qr', id, parsed.data.slug, parsed.data.reclaimDeletedLink ?? false);
  if (!added.ok) return added.response;

  await logActivity({
    userId: user.profile.id,
    action: 'qr.updated',
    entityType: 'qr',
    entityId: id,
    entityName: qr.name,
    details: { forwardAdded: added.code },
  });

  return Response.json({ code: added.code, forwards: await listForwards('qr', id) }, { status: 201 });
}

/** Stops forwarding an old link (`?code=samsam`). */
export async function DELETE(request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();
  if (!user?.profile) return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await params;
  const qr = await loadQr(id);
  if (!qr) return notFound();

  const code = new URL(request.url).searchParams.get('code')?.toLowerCase() ?? '';
  if (!code || !(await removeForward('qr', id, code))) {
    return Response.json({ error: 'That link is not forwarded to this QR code', code: 'FORWARD_NOT_FOUND' }, { status: 404 });
  }

  await logActivity({
    userId: user.profile.id,
    action: 'qr.updated',
    entityType: 'qr',
    entityId: id,
    entityName: qr.name,
    details: { forwardRemoved: code },
  });

  return Response.json({ removed: code, forwards: await listForwards('qr', id) });
}
