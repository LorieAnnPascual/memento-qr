import { and, eq, gt, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { qrCodes } from '@/lib/db/schema';
import { logScanEvent } from '@/lib/analytics/scan-logger';

type RouteContext = { params: Promise<{ shortCode: string }> };

function gateResponse(status: number, title: string, message: string): Response {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family: sans-serif; text-align: center; padding: 4rem 1rem;"><h1>${title}</h1><p>${message}</p></body></html>`,
    { status, headers: { 'Content-Type': 'text/html' } },
  );
}

const DESTINATION_UNAVAILABLE = gateResponse.bind(
  null,
  404,
  'Destination Unavailable',
  "This QR code's destination is not a valid link.",
);

/** Explains why a code could not be used, so people see the right message. */
async function explainRefusal(shortCode: string): Promise<Response> {
  const [qr] = await db.select().from(qrCodes).where(eq(qrCodes.shortCode, shortCode)).limit(1);

  if (!qr || !qr.targetUrl || qr.deletedAt) {
    return gateResponse(404, 'QR Code Not Found', 'This QR code does not exist or has been removed.');
  }
  if (qr.isPaused) {
    return gateResponse(410, 'QR Code Paused', 'This QR code has been temporarily deactivated.');
  }
  if (qr.expiresAt && new Date(qr.expiresAt) < new Date()) {
    return gateResponse(410, 'QR Code Expired', 'This QR code is no longer active.');
  }
  if (qr.scanLimit !== null && qr.scanCount >= qr.scanLimit) {
    return gateResponse(410, 'Scan Limit Reached', 'This QR code has reached its maximum number of scans.');
  }

  // Every gate passed, so the destination itself is what is wrong.
  return DESTINATION_UNAVAILABLE();
}

export async function GET(request: Request, { params }: RouteContext): Promise<Response> {
  const { shortCode } = await params;

  // One statement decides and counts: it only matches a code that is live
  // (not deleted, paused, expired or over its limit, and pointing at something
  // that looks like a URL), and increments its counter in the same step. That
  // is a single database round trip on the hot path, and two scans arriving
  // together can never both slip past a scan limit.
  const [claimed] = await db
    .update(qrCodes)
    .set({ scanCount: sql`${qrCodes.scanCount} + 1` })
    .where(
      and(
        eq(qrCodes.shortCode, shortCode),
        isNull(qrCodes.deletedAt),
        eq(qrCodes.isPaused, false),
        isNotNull(qrCodes.targetUrl),
        sql`${qrCodes.targetUrl} ~ '^[A-Za-z][A-Za-z0-9+.-]*:'`,
        or(isNull(qrCodes.expiresAt), gt(qrCodes.expiresAt, new Date())),
        or(isNull(qrCodes.scanLimit), lt(qrCodes.scanCount, qrCodes.scanLimit)),
      ),
    )
    .returning({ id: qrCodes.id, targetUrl: qrCodes.targetUrl });

  if (!claimed?.targetUrl) return explainRefusal(shortCode);

  let destination: URL;
  try {
    destination = new URL(claimed.targetUrl);
  } catch {
    // Passed the scheme check but still is not a usable URL: give the scan back.
    await db
      .update(qrCodes)
      .set({ scanCount: sql`${qrCodes.scanCount} - 1` })
      .where(eq(qrCodes.id, claimed.id));
    return DESTINATION_UNAVAILABLE();
  }

  // Fire-and-forget: scan logging (geo lookup, UA parsing, DB insert) must
  // never delay the redirect itself.
  logScanEvent(claimed.id, request).catch((error: unknown) => {
    console.error('Scan logging error:', error);
  });

  return Response.redirect(destination, 302);
}
