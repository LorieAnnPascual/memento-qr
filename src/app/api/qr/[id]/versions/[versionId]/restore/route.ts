import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { qrCodes, qrVersions } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { destinationChanged, ensureBaselineEntry, recordDestinationChange, typeChanged } from '@/lib/qr/destination-history';
import {
  changedFields,
  ensureBaselineVersion,
  recordVersion,
  restoreValues,
  snapshotOf,
  type QrSnapshot,
} from '@/lib/qr/versions';

type RouteContext = { params: Promise<{ id: string; versionId: string }> };

const VersionIdSchema = z.string().uuid();

/**
 * Puts a code back the way an earlier version had it. The restore is itself a new version on top, so
 * nothing is lost and a restore can be undone. The link name and the printed picture never change.
 */
export async function POST(_request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id, versionId } = await params;

  if (!VersionIdSchema.safeParse(versionId).success) {
    return Response.json({ error: 'Invalid request', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const [qr] = await db
    .select()
    .from(qrCodes)
    .where(and(eq(qrCodes.id, id), isNull(qrCodes.deletedAt)))
    .limit(1);

  if (!qr) {
    return Response.json({ error: 'QR code not found', code: 'QR_NOT_FOUND' }, { status: 404 });
  }

  const [version] = await db
    .select()
    .from(qrVersions)
    .where(and(eq(qrVersions.id, versionId), eq(qrVersions.qrCodeId, id)))
    .limit(1);

  if (!version) {
    return Response.json({ error: 'Version not found', code: 'VERSION_NOT_FOUND' }, { status: 404 });
  }

  const snapshot = version.snapshot as QrSnapshot;

  // A static code's picture holds its content, so it can never take a video (or any dynamic-only) state.
  if (!qr.isDynamic && snapshot.qrType === 'video') {
    return Response.json(
      { error: 'This version cannot be restored on a static code.', code: 'STATIC_CANNOT_CHANGE_TYPE' },
      { status: 409 },
    );
  }

  if (changedFields(snapshotOf(qr), snapshot).length === 0) {
    return Response.json(
      { error: 'That is already the current version', code: 'ALREADY_CURRENT' },
      { status: 409 },
    );
  }

  const movesDestination = qr.isDynamic && destinationChanged(qr.targetUrl, snapshot.targetUrl);

  const [updated] = await db
    .update(qrCodes)
    .set({
      ...restoreValues(snapshot, qr.isDynamic),
      updatedAt: new Date(),
      updatedBy: user.profile.id,
      // The old problem no longer applies; the next check will say what is true now.
      ...(movesDestination && { healthStatus: null, healthMessage: null, healthCheckedAt: null }),
    })
    .where(eq(qrCodes.id, id))
    .returning();

  await ensureBaselineVersion(qr);
  const restored = await recordVersion({
    row: updated,
    changedBy: user.profile.id,
    restoredFromId: version.id,
    summary: `Restored the version from ${new Date(version.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`,
  });

  // Keep the destination history (the check dialog) in step with what this restore did.
  const typeMoved = typeChanged(qr.qrType, snapshot.qrType);
  if (qr.isDynamic && (movesDestination || typeMoved)) {
    await ensureBaselineEntry({
      qrCodeId: id,
      destination: qr.targetUrl,
      qrType: qr.qrType,
      payloadFields: qr.payloadFields,
      createdAt: qr.createdAt,
    });
    await recordDestinationChange({
      qrCodeId: id,
      destination: snapshot.targetUrl ?? qr.targetUrl ?? qr.payload,
      previousDestination: qr.targetUrl,
      changedBy: user.profile.id,
      ...(typeMoved && {
        qrType: snapshot.qrType,
        previousQrType: qr.qrType,
        payloadFields: snapshot.payloadFields,
        previousPayloadFields: qr.payloadFields,
      }),
    });
  }

  await logActivity({
    userId: user.profile.id,
    action: 'qr.version_restored',
    entityType: 'qr',
    entityId: id,
    entityName: updated.name,
    details: restored ? { versionId: restored.id } : undefined,
  });

  return Response.json(updated);
}
