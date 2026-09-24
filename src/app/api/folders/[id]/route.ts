import { and, eq, ilike, ne } from 'drizzle-orm';

import { db } from '@/lib/db';
import { folders } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { getOwnedFolder } from '@/lib/folders/get-owned-folder';
import { FolderNameSchema } from '@/lib/folders/schemas';

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;
  const folder = await getOwnedFolder(id);

  if (!folder) {
    return Response.json({ error: 'Folder not found', code: 'FOLDER_NOT_FOUND' }, { status: 404 });
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
    .where(
      and(ilike(folders.name, parsed.data.name), ne(folders.id, id)),
    )
    .limit(1);

  if (duplicate) {
    return Response.json(
      { error: 'You already have a folder with that name', code: 'FOLDER_EXISTS' },
      { status: 409 },
    );
  }

  const [updated] = await db
    .update(folders)
    .set({ name: parsed.data.name, updatedAt: new Date() })
    .where(eq(folders.id, id))
    .returning();

  await logActivity({
    userId: user.profile.id,
    action: 'folder.renamed',
    entityType: 'folder',
    entityId: id,
    entityName: updated.name,
    details: { from: folder.name },
  });

  return Response.json(updated);
}

/** Deleting a folder never deletes its QR codes; they move back to "No folder". */
export async function DELETE(_request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;
  const folder = await getOwnedFolder(id);

  if (!folder) {
    return Response.json({ error: 'Folder not found', code: 'FOLDER_NOT_FOUND' }, { status: 404 });
  }

  await db.delete(folders).where(eq(folders.id, id));

  await logActivity({
    userId: user.profile.id,
    action: 'folder.deleted',
    entityType: 'folder',
    entityId: id,
    entityName: folder.name,
  });

  return new Response(null, { status: 204 });
}
