import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { qrCodes } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { checkDestination } from '@/lib/qr/check-destination';
import { getQrStatus } from '@/lib/qr/status';

type RouteContext = { params: Promise<{ id: string }> };

/** "Is this QR working?" Reports what a scan would do now, without scanning it (no scan is counted). */
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

  const status = getQrStatus(qr);
  // A static code's content may be plain text or a WiFi string; only links are worth fetching.
  const destination = await checkDestination(status.destination);

  return Response.json({ status, destination, checkedAt: new Date().toISOString() });
}
