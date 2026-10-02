import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { uploadedFiles } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { deleteFile, getStoredObject, readStoredHead } from '@/lib/storage';
import { MAX_VIDEO_BYTES, VIDEO_MIME_FOR_KIND, bytesFitExtension, videoKindForMime } from '@/lib/upload/media-types';
import { sniffVideo } from '@/lib/upload/sniff-video';

const CompleteSchema = z.object({
  path: z.string().max(200),
  fileName: z.string().min(1).max(300),
});

// What step 1 produces: "<profile id>/<nanoid>.<ext>".
const STORED_PATH = /^[0-9a-f-]{36}\/[A-Za-z0-9_-]{10,40}\.(mp4|webm|mov)$/;

async function reject(path: string, error: string, code: string): Promise<Response> {
  // Best effort: never leave a refused file sitting in public storage.
  await deleteFile(path).catch((cause) => console.error('Could not remove refused upload:', cause));
  return Response.json({ error, code }, { status: 400 });
}

/**
 * Step 2 of a video upload: the browser has sent the file to storage; check that
 * what arrived is really a video of an allowed size, then add it to the library.
 */
export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const parsed = CompleteSchema.safeParse(await request.json().catch(() => null));
  const path = parsed.success ? parsed.data.path : '';

  // Only paths this person was given in step 1 (their own folder, our naming).
  if (!parsed.success || !STORED_PATH.test(path) || !path.startsWith(`${user.profile.id}/`)) {
    return Response.json({ error: 'Invalid request', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  try {
    const [existing] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.storagePath, path)).limit(1);
    if (existing) return Response.json({ ...existing, url: existing.publicUrl });

    const stored = await getStoredObject(path);
    if (!stored) {
      return Response.json(
        { error: 'The upload did not arrive. Please try again.', code: 'UPLOAD_MISSING' },
        { status: 400 },
      );
    }

    const extension = path.slice(path.lastIndexOf('.') + 1) as 'mp4' | 'webm' | 'mov';

    if (stored.size > MAX_VIDEO_BYTES) return reject(path, 'That video is too large', 'FILE_TOO_LARGE');
    // The browser chose this content type; a page or script would otherwise be served as one.
    if (videoKindForMime(stored.contentType) !== extension) {
      return reject(path, 'The file content does not match its type', 'UNSUPPORTED_FILE_TYPE');
    }
    if (!bytesFitExtension(sniffVideo(await readStoredHead(stored.publicUrl)), extension)) {
      return reject(path, 'That file is not a valid video', 'UNSUPPORTED_FILE_TYPE');
    }

    const displayName = parsed.data.fileName.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200);
    const [record] = await db
      .insert(uploadedFiles)
      .values({
        userId: user.profile.id,
        fileName: displayName,
        fileSize: stored.size,
        mimeType: VIDEO_MIME_FOR_KIND[extension],
        storagePath: path,
        publicUrl: stored.publicUrl,
      })
      .returning();

    return Response.json({ ...record, url: stored.publicUrl }, { status: 201 });
  } catch (error) {
    console.error('Video upload complete error:', error);
    return Response.json({ error: 'Failed to finish the upload', code: 'UPLOAD_FAILED' }, { status: 500 });
  }
}
