import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { qrCodes } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { getOwnedFolder } from '@/lib/folders/get-owned-folder';
import { destinationChanged, ensureBaselineEntry, recordDestinationChange, typeChanged } from '@/lib/qr/destination-history';
import {
  INVALID_VIDEO_RESPONSE,
  STATIC_CANNOT_BECOME_VIDEO_RESPONSE,
  UpdateQRSchema,
  VIDEO_MUST_BE_DYNAMIC_RESPONSE,
} from '@/lib/qr/schemas';
import { playableVideoUrl } from '@/lib/qr/video-player';
import { buildRedirectUrl, generateShortCode } from '@/lib/qr/short-code';
import {
  checkRequestedSlug,
  isUniqueViolation,
  recordRename,
  releaseDeletedSlug,
  SLUG_TAKEN_RESPONSE,
} from '@/lib/slugs/slugs';

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
  // (judged by the type the code will have after this save, so a video can be switched to another type)
  const isVideo = (data.qrType ?? existing.qrType) === 'video';
  if (isVideo && data.isDynamic === false) return VIDEO_MUST_BE_DYNAMIC_RESPONSE();
  // A static code cannot become a video without a new link, which changes the printed picture.
  if (!existing.isDynamic && existing.qrType !== 'video' && data.qrType === 'video') {
    return STATIC_CANNOT_BECOME_VIDEO_RESPONSE();
  }
  // A new video must be one of our own hosted videos (a rename or pause sends no video).
  const newVideoTarget = data.targetUrl ?? data.payload;
  if (isVideo && newVideoTarget !== undefined && !playableVideoUrl(newVideoTarget)) return INVALID_VIDEO_RESPONSE();
  const effectiveIsDynamic = isVideo ? true : (data.isDynamic ?? existing.isDynamic);

  // A new link name (`/q/ana-memorial`). Blank or omitted keeps the current one.
  let requestedSlug: string | null = null;
  if (effectiveIsDynamic) {
    const requested = await checkRequestedSlug('qr', data.slug, id, data.reclaimDeletedLink);
    if (!requested.ok) return requested.response;
    requestedSlug = requested.slug;
    // The name was a deleted code's: it loses the link so this code can have it.
    if (requested.reclaim && requested.slug) await releaseDeletedSlug(requested.slug);
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

  // Always stored with the form values it goes with (`/q/<name>` also reads it to pick redirect or player).
  const newType = typeChanged(existing.qrType, data.qrType) ? data.qrType : null;
  // Only dynamic codes keep a history of it (a static code's picture holds the content itself).
  const recordTypeChange = newType !== null && effectiveIsDynamic;

  const values = {
    ...(data.name !== undefined && { name: data.name }),
    ...(newType !== null && { qrType: newType }),
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

  if (destinationChanged(existing.targetUrl, payloadUpdate.targetUrl) || recordTypeChange) {
    // A code from before history existed has no entry for how it was, so there would be nothing to restore.
    await ensureBaselineEntry({
      qrCodeId: id,
      destination: existing.targetUrl,
      qrType: existing.qrType,
      payloadFields: existing.payloadFields,
      createdAt: existing.createdAt,
    });
    await recordDestinationChange({
      qrCodeId: id,
      destination: payloadUpdate.targetUrl ?? existing.targetUrl ?? existing.payload,
      previousDestination: existing.targetUrl,
      changedBy: user.profile.id,
      ...(recordTypeChange && {
        qrType: newType,
        previousQrType: existing.qrType,
        payloadFields: data.payloadFields ?? existing.payloadFields,
        previousPayloadFields: existing.payloadFields,
      }),
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
