import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { qrCodes, qrDestinationHistory, userProfiles } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { displayName } from '@/lib/team/display-name';

type RouteContext = { params: Promise<{ id: string }> };

const HISTORY_LIMIT = 50;

/** A dynamic code's destination changes, newest first, plus what it points to now. */
export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;

  const [qr] = await db
    .select({ id: qrCodes.id, isDynamic: qrCodes.isDynamic, targetUrl: qrCodes.targetUrl })
    .from(qrCodes)
    .where(and(eq(qrCodes.id, id), isNull(qrCodes.deletedAt)))
    .limit(1);

  if (!qr) {
    return Response.json({ error: 'QR code not found', code: 'QR_NOT_FOUND' }, { status: 404 });
  }

  const rows = await db
    .select({
      id: qrDestinationHistory.id,
      destination: qrDestinationHistory.destination,
      previousDestination: qrDestinationHistory.previousDestination,
      restoredFromId: qrDestinationHistory.restoredFromId,
      createdAt: qrDestinationHistory.createdAt,
      fullName: userProfiles.fullName,
      email: userProfiles.email,
    })
    .from(qrDestinationHistory)
    .leftJoin(userProfiles, eq(qrDestinationHistory.changedBy, userProfiles.id))
    .where(eq(qrDestinationHistory.qrCodeId, id))
    .orderBy(desc(qrDestinationHistory.createdAt))
    .limit(HISTORY_LIMIT);

  return Response.json({
    isDynamic: qr.isDynamic,
    current: qr.targetUrl,
    entries: rows.map((row) => ({
      id: row.id,
      destination: row.destination,
      previousDestination: row.previousDestination,
      isRestore: row.restoredFromId !== null,
      createdAt: row.createdAt,
      changedBy: row.email ? displayName({ fullName: row.fullName, email: row.email }) : null,
    })),
  });
}
