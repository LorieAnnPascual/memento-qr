import { and, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { qrCodes } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { getOwnedFolder } from '@/lib/folders/get-owned-folder';
import { MoveQRSchema } from '@/lib/folders/schemas';

/** Moves several QR codes into a folder (or out of any folder with `folderId: null`). */
export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const parsed = MoveQRSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return Response.json({ error: 'Invalid request', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const { ids, folderId } = parsed.data;

  const folder = folderId ? await getOwnedFolder(folderId, user.profile.id) : null;
  if (folderId && !folder) {
    return Response.json({ error: 'Folder not found', code: 'FOLDER_NOT_FOUND' }, { status: 404 });
  }

  const moved = await db
    .update(qrCodes)
    .set({ folderId, updatedAt: new Date() })
    .where(
      and(inArray(qrCodes.id, ids), eq(qrCodes.userId, user.profile.id), isNull(qrCodes.deletedAt)),
    )
    .returning({ id: qrCodes.id });

  await logActivity({
    userId: user.profile.id,
    action: 'qr.moved',
    entityType: 'folder',
    entityId: folder?.id ?? null,
    entityName: folder?.name ?? 'No folder',
    details: { count: moved.length },
  });

  return Response.json({ moved: moved.length });
}
