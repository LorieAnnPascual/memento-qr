import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { qrCodes, qrDestinationHistory } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { recordDestinationChange } from '@/lib/qr/destination-history';

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

  if (entry.destination === qr.targetUrl) {
    return Response.json(
      { error: 'That is already the current destination', code: 'ALREADY_CURRENT' },
      { status: 409 },
    );
  }

  const [updated] = await db
    .update(qrCodes)
    .set({
      targetUrl: entry.destination,
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
  });

  await logActivity({
    userId: user.profile.id,
    action: 'qr.destination_restored',
    entityType: 'qr',
    entityId: id,
    entityName: updated.name,
    details: { from: qr.targetUrl, to: entry.destination },
  });

  return Response.json({ targetUrl: updated.targetUrl });
}
