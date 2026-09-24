import { and, asc, count, eq, ilike, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { folders, qrCodes } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { FolderNameSchema } from '@/lib/folders/schemas';

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const rows = await db
    .select({ id: folders.id, name: folders.name, createdAt: folders.createdAt, qrCount: count(qrCodes.id) })
    .from(folders)
    .leftJoin(qrCodes, and(eq(qrCodes.folderId, folders.id), isNull(qrCodes.deletedAt)))
    .groupBy(folders.id)
    .orderBy(asc(folders.name));

  return Response.json({ items: rows });
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const parsed = FolderNameSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid folder name', code: 'VALIDATION_ERROR' },
      { status: 400 },
    );
  }

  const [duplicate] = await db
    .select({ id: folders.id })
    .from(folders)
    .where(ilike(folders.name, parsed.data.name))
    .limit(1);

  if (duplicate) {
    return Response.json(
      { error: 'You already have a folder with that name', code: 'FOLDER_EXISTS' },
      { status: 409 },
    );
  }

  const [created] = await db
    .insert(folders)
    .values({ userId: user.profile.id, name: parsed.data.name })
    .returning();

  await logActivity({
    userId: user.profile.id,
    action: 'folder.created',
    entityType: 'folder',
    entityId: created.id,
    entityName: created.name,
  });

  return Response.json({ ...created, qrCount: 0 }, { status: 201 });
}
