import { and, count, desc, eq, ilike, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { qrCodes } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { getOwnedFolder } from '@/lib/folders/get-owned-folder';
import { recordDestinationChange } from '@/lib/qr/destination-history';
import { CreateQRSchema } from '@/lib/qr/schemas';
import { buildRedirectUrl, generateShortCode } from '@/lib/qr/short-code';
import type { QRType } from '@/types/qr';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE),
  );
  const search = searchParams.get('search')?.trim();
  const qrType = searchParams.get('type') as QRType | null;

  const conditions = [isNull(qrCodes.deletedAt)];
  if (search) conditions.push(ilike(qrCodes.name, `%${search}%`));
  if (qrType) conditions.push(eq(qrCodes.qrType, qrType));

  // "none" = QR codes that are not in any folder.
  const folder = searchParams.get('folder');
  if (folder === 'none') conditions.push(isNull(qrCodes.folderId));
  else if (folder && /^[0-9a-f-]{36}$/i.test(folder)) conditions.push(eq(qrCodes.folderId, folder));

  // "me" = handed to the signed-in person, "none" = nobody yet, or a teammate's id.
  const assigned = searchParams.get('assigned');
  if (assigned === 'me') conditions.push(eq(qrCodes.assignedTo, user.profile.id));
  else if (assigned === 'none') conditions.push(isNull(qrCodes.assignedTo));
  else if (assigned && /^[0-9a-f-]{36}$/i.test(assigned)) conditions.push(eq(qrCodes.assignedTo, assigned));

  const where = and(...conditions);

  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(qrCodes)
      .where(where)
      .orderBy(desc(qrCodes.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(qrCodes).where(where),
  ]);

  return Response.json({ items, total, page, limit });
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = CreateQRSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid QR code data', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  if (data.folderId && !(await getOwnedFolder(data.folderId))) {
    return Response.json({ error: 'Folder not found', code: 'FOLDER_NOT_FOUND' }, { status: 404 });
  }

  const isDynamic = data.isDynamic ?? false;
  const shortCode = isDynamic ? generateShortCode() : null;

  const [created] = await db
    .insert(qrCodes)
    .values({
      userId: user.profile.id,
      name: data.name,
      qrType: data.qrType,
      // For a dynamic QR, the code must encode the stable redirect link, not
      // the destination — otherwise the printed QR could never be repointed.
      payload: shortCode ? buildRedirectUrl(shortCode) : data.payload,
      payloadFields: data.payloadFields,
      styleConfig: data.styleConfig,
      isDynamic,
      shortCode,
      targetUrl: shortCode ? (data.targetUrl ?? data.payload) : null,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      scanLimit: data.scanLimit ?? null,
      tags: data.tags,
      notes: data.notes,
      folderId: data.folderId ?? null,
    })
    .returning();

  if (created.targetUrl) {
    await recordDestinationChange({
      qrCodeId: created.id,
      destination: created.targetUrl,
      previousDestination: null,
      changedBy: user.profile.id,
    });
  }

  await logActivity({
    userId: user.profile.id,
    action: 'qr.created',
    entityType: 'qr',
    entityId: created.id,
    entityName: created.name,
    details: { qrType: created.qrType, isDynamic },
  });

  return Response.json(created, { status: 201 });
}
