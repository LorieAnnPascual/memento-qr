import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { uploadedFiles } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { clearMediaReferences } from '@/lib/qr/clear-media-references';
import { deleteFile } from '@/lib/storage';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;

  const [existing] = await db
    .select()
    .from(uploadedFiles)
    .where(and(eq(uploadedFiles.id, id), eq(uploadedFiles.userId, user.profile.id)))
    .limit(1);

  if (!existing) {
    return Response.json({ error: 'File not found', code: 'FILE_NOT_FOUND' }, { status: 404 });
  }

  try {
    await deleteFile(existing.storagePath);
  } catch (error) {
    console.error('Storage delete error:', error);
    return Response.json({ error: 'Failed to delete file', code: 'DELETE_FAILED' }, { status: 500 });
  }

  await clearMediaReferences(existing.publicUrl, user.profile.id);
  await db.delete(uploadedFiles).where(eq(uploadedFiles.id, id));

  return new Response(null, { status: 204 });
}
