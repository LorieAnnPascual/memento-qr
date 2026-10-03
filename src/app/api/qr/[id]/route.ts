import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { qrCodes } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { getOwnedFolder } from '@/lib/folders/get-owned-folder';
import { destinationChanged, recordDestinationChange } from '@/lib/qr/destination-history';
import { INVALID_VIDEO_RESPONSE, UpdateQRSchema, VIDEO_MUST_BE_DYNAMIC_RESPONSE } from '@/lib/qr/schemas';
import { playableVideoUrl } from '@/lib/qr/video-player';
import { buildRedirectUrl, generateShortCode } from '@/lib/qr/short-code';
import { checkRequestedSlug, isUniqueViolation, recordRename, SLUG_TAKEN_RESPONSE } from '@/lib/slugs/slugs';

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
    .where(and(eq(qrCodes.id, id), isNull(qrCodes.deletedAt)))
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
    .where(and(eq(qrCodes.id, id), isNull(qrCodes.deletedAt)))
    .limit(1);

  if (!existing) {
    return Response.json({ error: 'QR code not found', code: 'QR_NOT_FOUND' }, { status: 404 });
  }

  const data = parsed.data;

  if (data.folderId && !(await getOwnedFolder(data.folderId))) {
    return Response.json({ error: 'Folder not found', code: 'FOLDER_NOT_FOUND' }, { status: 404 });
  }

  // A video code is always dynamic, also when it is edited.
  const isVideo = existing.qrType === 'video' || data.qrType === 'video';
  if (isVideo && data.isDynamic === false) return VIDEO_MUST_BE_DYNAMIC_RESPONSE();
  // A new video must be one of our own hosted videos (a rename or pause sends no video).
  const newVideoTarget = data.targetUrl ?? data.payload;
  if (isVideo && newVideoTarget !== undefined && !playableVideoUrl(newVideoTarget)) return INVALID_VIDEO_RESPONSE();
  const effectiveIsDynamic = isVideo ? true : (data.isDynamic ?? existing.isDynamic);

  // A new link name (`/q/ana-memorial`). Blank or omitted keeps the current one.
  let requestedSlug: string | null = null;
  if (effectiveIsDynamic) {
    const requested = await checkRequestedSlug('qr', data.slug, id);
    if (!requested.ok) return requested.response;
    requestedSlug = requested.slug;
  }

  // `data.payload`, when sent, is always the *content* the designer built
  // from the current form values — never the short link itself. Dynamic
  // codes must keep encoding the same stable short link regardless of how
  // the underlying content changes, so content updates are redirected into
  // `targetUrl` instead of overwriting `payload`.
  let payloadUpdate: { payload?: string; shortCode?: string; targetUrl?: string | null } = {};
  if (effectiveIsDynamic) {
    const shortCode = requestedSlug ?? existing.shortCode ?? generateShortCode();
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

  // Renaming the link: the old name must keep forwarding to this code (printed copies exist),
  // so the new name and the old-name record are saved together.
  const renamedFrom =
    effectiveIsDynamic && existing.shortCode && payloadUpdate.shortCode && payloadUpdate.shortCode !== existing.shortCode
      ? existing.shortCode
      : null;

  const values = {
    ...(data.name !== undefined && { name: data.name }),
    ...payloadUpdate,
    ...((data.isDynamic !== undefined || isVideo) && { isDynamic: effectiveIsDynamic }),
    ...(data.payloadFields !== undefined && { payloadFields: data.payloadFields }),
    ...(data.styleConfig !== undefined && { styleConfig: data.styleConfig }),
    ...(data.isPaused !== undefined && { isPaused: data.isPaused }),
    ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt ? new Date(data.expiresAt) : null }),
    ...(data.scanLimit !== undefined && { scanLimit: data.scanLimit }),
    ...(data.tags !== undefined && { tags: data.tags }),
    ...(data.notes !== undefined && { notes: data.notes }),
    ...(data.folderId !== undefined && { folderId: data.folderId }),
    updatedAt: new Date(),
    updatedBy: user.profile.id,
    // A new destination invalidates the last link check.
    ...(destinationChanged(existing.targetUrl, payloadUpdate.targetUrl) && {
      healthStatus: null,
      healthMessage: null,
      healthCheckedAt: null,
    }),
  };

  const save = (executor: Pick<typeof db, 'update'>) =>
    executor.update(qrCodes).set(values).where(eq(qrCodes.id, id)).returning();

  let updated: typeof qrCodes.$inferSelect;
  try {
    [updated] = renamedFrom
      ? await db.transaction(async (tx) => {
          const rows = await save(tx);
          await recordRename(tx, 'qr', id, renamedFrom, payloadUpdate.shortCode!);
          return rows;
        })
      : await save(db);
  } catch (error) {
    // Two people picked the same link name at the same moment.
    if (isUniqueViolation(error)) return SLUG_TAKEN_RESPONSE();
    throw error;
  }

  if (destinationChanged(existing.targetUrl, payloadUpdate.targetUrl)) {
    await recordDestinationChange({
      qrCodeId: id,
      destination: payloadUpdate.targetUrl,
      previousDestination: existing.targetUrl,
      changedBy: user.profile.id,
    });
  }

  await logActivity({
    userId: user.profile.id,
    action: 'qr.updated',
    entityType: 'qr',
    entityId: id,
    entityName: updated.name,
    // Pausing/resuming is the one edit worth calling out on its own.
    details: renamedFrom
      ? { linkRenamedFrom: renamedFrom, linkRenamedTo: payloadUpdate.shortCode }
      : data.isPaused !== undefined
        ? { isPaused: data.isPaused }
        : undefined,
    collapseWithinMs: data.isPaused !== undefined || renamedFrom ? undefined : 10 * 60 * 1000,
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
    .where(and(eq(qrCodes.id, id), isNull(qrCodes.deletedAt)))
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
