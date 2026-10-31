import { and, asc, eq, gt, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { qrCodes, qrDestinationHistory } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { recordDestinationChange } from '@/lib/qr/destination-history';
import { ensureBaselineVersion, recordVersion } from '@/lib/qr/versions';
import { playableVideoUrl } from '@/lib/qr/video-player';

type RouteContext = { params: Promise<{ id: string }> };

const RestoreSchema = z.object({ historyId: z.string().uuid() });

/** Points a dynamic code back at a destination it had before. The restore is itself recorded. */
export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;
  const parsed = RestoreSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
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

  if (!qr.isDynamic) {
    return Response.json(
      { error: 'Only dynamic codes have a destination to restore', code: 'NOT_DYNAMIC' },
      { status: 409 },
    );
  }

  const [entry] = await db
    .select()
    .from(qrDestinationHistory)
    .where(and(eq(qrDestinationHistory.id, parsed.data.historyId), eq(qrDestinationHistory.qrCodeId, id)))
    .limit(1);

  if (!entry) {
    return Response.json({ error: 'History entry not found', code: 'HISTORY_NOT_FOUND' }, { status: 404 });
  }

  // The type (and form values) the code had when this entry was current: the entry's own if it
  // recorded one, else what the next type change started from, else unknown (left as it is).
  let restoredType: string | null = entry.qrType ?? null;
  let restoredFields: unknown = entry.payloadFields;
  if (restoredType === null) {
    const [nextTypeChange] = await db
      .select()
      .from(qrDestinationHistory)
      .where(
        and(
          eq(qrDestinationHistory.qrCodeId, id),
          gt(qrDestinationHistory.createdAt, entry.createdAt),
          isNotNull(qrDestinationHistory.previousQrType),
        ),
      )
      .orderBy(asc(qrDestinationHistory.createdAt))
      .limit(1);
    if (nextTypeChange?.previousQrType) {
      restoredType = nextTypeChange.previousQrType;
      restoredFields = nextTypeChange.previousPayloadFields;
    }
  }
  // Still unknown while the code is a video: a destination that is not a hosted video cannot be played.
  if (restoredType === null && qr.qrType === 'video' && !playableVideoUrl(entry.destination)) {
    restoredType = 'url';
  }
  const typeWillChange =restoredType !== null && restoredType !== qr.qrType;

  if (entry.destination === qr.targetUrl && !typeWillChange) {
    return Response.json(
      { error: 'That is already the current destination', code: 'ALREADY_CURRENT' },
      { status: 409 },
    );
  }

  const [updated] = await db
    .update(qrCodes)
    .set({
      targetUrl: entry.destination,
      ...(typeWillChange && { qrType: restoredType! }),
      ...(typeWillChange && restoredFields != null && { payloadFields: restoredFields }),
      updatedAt: new Date(),
      updatedBy: user.profile.id,
      // The old problem no longer applies; the next check will say what is true now.
      healthStatus: null,
      healthMessage: null,
      healthCheckedAt: null,
    })
    .where(eq(qrCodes.id, id))
    .returning();

  await recordDestinationChange({
    qrCodeId: id,
    destination: entry.destination,
    previousDestination: qr.targetUrl,
    changedBy: user.profile.id,
    restoredFromId: entry.id,
    ...(typeWillChange && {
      qrType: restoredType,
      previousQrType: qr.qrType,
      payloadFields: restoredFields ?? qr.payloadFields,
      previousPayloadFields: qr.payloadFields,
    }),
  });

  await ensureBaselineVersion(qr);
  await recordVersion({ row: updated, previous: qr, changedBy: user.profile.id, summary: 'Restored an earlier destination' });

  await logActivity({
    userId: user.profile.id,
    action: 'qr.destination_restored',
    entityType: 'qr',
    entityId: id,
    entityName: updated.name,
    details: {
      from: qr.targetUrl,
      to: entry.destination,
      ...(typeWillChange && { typeFrom: qr.qrType, typeTo: restoredType }),
    },
  });

  return Response.json({ targetUrl: updated.targetUrl });
}
