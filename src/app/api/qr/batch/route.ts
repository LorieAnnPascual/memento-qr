import { z } from 'zod';

import { db } from '@/lib/db';
import { qrCodes, type NewQRCode } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { getOwnedFolder } from '@/lib/folders/get-owned-folder';
import { BATCH_QR_TYPES, buildBatchPayload, MAX_BATCH_ROWS, validateBatchRow } from '@/lib/qr/batch';
import { buildRedirectUrl, generateShortCode } from '@/lib/qr/short-code';

const BatchCreateSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string(),
        qrType: z.enum(BATCH_QR_TYPES),
        content: z.string(),
        isDynamic: z.boolean(),
        tags: z.array(z.string().max(50)).max(20),
      }),
    )
    .min(1)
    .max(MAX_BATCH_ROWS),
  styleConfig: z.record(z.string(), z.unknown()),
  folderId: z.string().uuid().nullable().optional(),
});

/** Creates many QR codes at once from validated CSV rows. All-or-nothing. */
export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const parsed = BatchCreateSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid batch data', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { items, styleConfig, folderId } = parsed.data;

  // Never trust the browser's validation: re-check every row here.
  const problems = items.flatMap((item, index) => {
    const problem = validateBatchRow(item);
    return problem ? [`Row ${index + 1}: ${problem}`] : [];
  });

  if (problems.length > 0) {
    return Response.json(
      { error: problems.slice(0, 5).join(' '), code: 'INVALID_ROWS', details: problems },
      { status: 400 },
    );
  }

  if (folderId && !(await getOwnedFolder(folderId, user.profile.id))) {
    return Response.json({ error: 'Folder not found', code: 'FOLDER_NOT_FOUND' }, { status: 404 });
  }

  const values: NewQRCode[] = items.map((item) => {
    const { payload, payloadFields } = buildBatchPayload(item);
    const shortCode = item.isDynamic ? generateShortCode() : null;

    return {
      userId: user.profile!.id,
      name: item.name.trim(),
      qrType: item.qrType,
      // A dynamic QR encodes its stable short link; the real destination is targetUrl.
      payload: shortCode ? buildRedirectUrl(shortCode) : payload,
      payloadFields,
      styleConfig,
      isDynamic: item.isDynamic,
      shortCode,
      targetUrl: shortCode ? payload : null,
      tags: item.tags,
      folderId: folderId ?? null,
    };
  });

  const created = await db.insert(qrCodes).values(values).returning({ id: qrCodes.id });

  await logActivity({
    userId: user.profile.id,
    action: 'qr.batch_created',
    entityType: 'qr',
    entityName: `${created.length} QR codes`,
    details: { count: created.length, dynamic: values.filter((v) => v.isDynamic).length },
  });

  return Response.json({ created: created.length }, { status: 201 });
}
