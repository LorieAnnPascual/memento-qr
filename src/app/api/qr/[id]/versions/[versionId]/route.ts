import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { qrCodes, qrVersions } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { diffRows, snapshotOf, type QrSnapshot } from '@/lib/qr/versions';

type RouteContext = { params: Promise<{ id: string; versionId: string }> };

const VersionIdSchema = z.string().uuid();

/** What using one version would change: its details next to how the code is now. */
export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
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
  const rows = diffRows(snapshotOf(qr), snapshot);

  return Response.json({
    id: version.id,
    summary: version.summary,
    createdAt: version.createdAt,
    rows,
    // Nothing to use when it matches how the code is now; a static code cannot take a video.
    canRestore: rows.length > 0 && (qr.isDynamic || snapshot.qrType !== 'video'),
  });
}
