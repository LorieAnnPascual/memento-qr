import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { qrCodes } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { getOwnedFolder } from '@/lib/folders/get-owned-folder';
import { UpdateQRSchema } from '@/lib/qr/schemas';
import { buildRedirectUrl, generateShortCode } from '@/lib/qr/short-code';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;

  const [qrCode] = await db
    .select()
    .from(qrCodes)
    .where(and(eq(qrCodes.id, id), eq(qrCodes.userId, user.profile.id), isNull(qrCodes.deletedAt)))
    .limit(1);

  if (!qrCode) {
    return Response.json({ error: 'QR code not found', code: 'QR_NOT_FOUND' }, { status: 404 });
  }

  return Response.json(qrCode);
}

export async function PUT(request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = UpdateQRSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid QR code data', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const [existing] = await db
    .select()
    .from(qrCodes)
    .where(and(eq(qrCodes.id, id), eq(qrCodes.userId, user.profile.id), isNull(qrCodes.deletedAt)))
    .limit(1);

  if (!existing) {
    return Response.json({ error: 'QR code not found', code: 'QR_NOT_FOUND' }, { status: 404 });
  }

  const data = parsed.data;

  if (data.folderId && !(await getOwnedFolder(data.folderId, user.profile.id))) {
    return Response.json({ error: 'Folder not found', code: 'FOLDER_NOT_FOUND' }, { status: 404 });
  }

  const effectiveIsDynamic = data.isDynamic ?? existing.isDynamic;

  // `data.payload`, when sent, is always the *content* the designer built
  // from the current form values — never the short link itself. Dynamic
  // codes must keep encoding the same stable short link regardless of how
  // the underlying content changes, so content updates are redirected into
  // `targetUrl` instead of overwriting `payload`.
  let payloadUpdate: { payload?: string; shortCode?: string; targetUrl?: string | null } = {};
  if (effectiveIsDynamic) {
    const shortCode = existing.shortCode ?? generateShortCode();
    payloadUpdate = {
      shortCode,
      payload: buildRedirectUrl(shortCode),
      targetUrl: data.payload ?? existing.targetUrl ?? existing.payload,
    };
  } else if (data.isDynamic === false) {
    payloadUpdate = { targetUrl: null, payload: data.payload ?? existing.targetUrl ?? existing.payload };
  } else if (data.payload !== undefined) {
    payloadUpdate = { payload: data.payload };
  }

  const [updated] = await db
    .update(qrCodes)
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...payloadUpdate,
      ...(data.isDynamic !== undefined && { isDynamic: data.isDynamic }),
      ...(data.payloadFields !== undefined && { payloadFields: data.payloadFields }),
      ...(data.styleConfig !== undefined && { styleConfig: data.styleConfig }),
      ...(data.isPaused !== undefined && { isPaused: data.isPaused }),
      ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt ? new Date(data.expiresAt) : null }),
      ...(data.scanLimit !== undefined && { scanLimit: data.scanLimit }),
      ...(data.tags !== undefined && { tags: data.tags }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.folderId !== undefined && { folderId: data.folderId }),
      updatedAt: new Date(),
    })
    .where(eq(qrCodes.id, id))
    .returning();

  await logActivity({
    userId: user.profile.id,
    action: 'qr.updated',
    entityType: 'qr',
    entityId: id,
    entityName: updated.name,
    // Pausing/resuming is the one edit worth calling out on its own.
    details: data.isPaused !== undefined ? { isPaused: data.isPaused } : undefined,
    collapseWithinMs: data.isPaused !== undefined ? undefined : 10 * 60 * 1000,
  });

  return Response.json(updated);
}

export async function DELETE(_request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;

  const [existing] = await db
    .select({ id: qrCodes.id, name: qrCodes.name })
    .from(qrCodes)
    .where(and(eq(qrCodes.id, id), eq(qrCodes.userId, user.profile.id), isNull(qrCodes.deletedAt)))
    .limit(1);

  if (!existing) {
    return Response.json({ error: 'QR code not found', code: 'QR_NOT_FOUND' }, { status: 404 });
  }

  await db.update(qrCodes).set({ deletedAt: new Date() }).where(eq(qrCodes.id, id));

  await logActivity({
    userId: user.profile.id,
    action: 'qr.deleted',
    entityType: 'qr',
    entityId: id,
    entityName: existing.name,
  });

  return new Response(null, { status: 204 });
}
