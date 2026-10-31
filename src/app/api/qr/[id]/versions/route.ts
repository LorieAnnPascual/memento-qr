import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { qrCodes, qrVersions, userProfiles } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { snapshotOf, type QrSnapshot } from '@/lib/qr/versions';
import { displayName } from '@/lib/team/display-name';

type RouteContext = { params: Promise<{ id: string }> };

// Every version is kept; this only bounds one response.
const LIST_LIMIT = 500;

/** A code's versions, newest first. The newest is what the code is now. */
export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;

  const [qr] = await db
    .select()
    .from(qrCodes)
    .where(and(eq(qrCodes.id, id), isNull(qrCodes.deletedAt)))
    .limit(1);

  if (!qr) {
    return Response.json({ error: 'QR code not found', code: 'QR_NOT_FOUND' }, { status: 404 });
  }

  const rows = await db
    .select({
      id: qrVersions.id,
      snapshot: qrVersions.snapshot,
      summary: qrVersions.summary,
      restoredFromId: qrVersions.restoredFromId,
      createdAt: qrVersions.createdAt,
      fullName: userProfiles.fullName,
      email: userProfiles.email,
    })
    .from(qrVersions)
    .leftJoin(userProfiles, eq(qrVersions.changedBy, userProfiles.id))
    .where(eq(qrVersions.qrCodeId, id))
    .orderBy(desc(qrVersions.createdAt))
    .limit(LIST_LIMIT);

  // A code nobody has saved since version history began has no versions yet. Show how it is now, so the
  // list is never blank; its first change is recorded together with this starting state.
  if (rows.length === 0) {
    const current = snapshotOf(qr);
    return Response.json({
      versions: [
        {
          id: 'current',
          number: 1,
          isCurrent: true,
          summary: 'How it is now. Changes you save from here on are listed above this.',
          isRestore: false,
          createdAt: qr.updatedAt,
          changedBy: null,
          name: current.name,
          qrType: current.qrType,
          destination: current.targetUrl ?? current.payload,
        },
      ],
    });
  }

  return Response.json({
    versions: rows.map((row, index) => {
      const snapshot = row.snapshot as QrSnapshot;
      return {
        id: row.id,
        number: rows.length - index,
        isCurrent: index === 0,
        summary: row.summary,
        isRestore: row.restoredFromId !== null,
        createdAt: row.createdAt,
        changedBy: row.email ? displayName({ fullName: row.fullName, email: row.email }) : null,
        name: snapshot.name,
        qrType: snapshot.qrType,
        destination: snapshot.targetUrl ?? snapshot.payload,
      };
    }),
  });
}
