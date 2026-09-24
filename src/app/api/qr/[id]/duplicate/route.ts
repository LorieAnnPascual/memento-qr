import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { qrCodes } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { buildRedirectUrl, generateShortCode } from '@/lib/qr/short-code';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Makes an independent copy of a QR code, e.g. to try a different style on the
 * same content. A dynamic copy gets its own short link and a fresh scan count,
 * so the two can be compared.
 */
export async function POST(_request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;

  const [source] = await db
    .select()
    .from(qrCodes)
    .where(and(eq(qrCodes.id, id), isNull(qrCodes.deletedAt)))
    .limit(1);

  if (!source) {
    return Response.json({ error: 'QR code not found', code: 'QR_NOT_FOUND' }, { status: 404 });
  }

  const shortCode = source.isDynamic ? generateShortCode() : null;
  const name = `${source.name} (copy)`.slice(0, 200);

  const [created] = await db
    .insert(qrCodes)
    .values({
      userId: user.profile.id,
      name,
      qrType: source.qrType,
      payload: shortCode ? buildRedirectUrl(shortCode) : source.payload,
      payloadFields: source.payloadFields,
      isDynamic: source.isDynamic,
      shortCode,
      targetUrl: source.targetUrl,
      styleConfig: source.styleConfig,
      templateId: source.templateId,
      folderId: source.folderId,
      expiresAt: source.expiresAt,
      scanLimit: source.scanLimit,
      tags: source.tags,
      notes: source.notes,
    })
    .returning();

  await logActivity({
    userId: user.profile.id,
    action: 'qr.duplicated',
    entityType: 'qr',
    entityId: created.id,
    entityName: created.name,
    details: { from: source.name },
  });

  return Response.json(created, { status: 201 });
}
