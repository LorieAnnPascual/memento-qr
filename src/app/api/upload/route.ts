import { nanoid } from 'nanoid';
import { desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { uploadedFiles } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { uploadFile } from '@/lib/storage';
import { EXTENSION_FOR_KIND, MIME_FOR_KIND, sniffImage } from '@/lib/upload/sniff-image';

const MAX_FILE_BYTES = 500 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

/** The signed-in user's uploaded images, newest first (for the "choose from media" picker). */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const files = await db
      .select()
      .from(uploadedFiles)
      .where(eq(uploadedFiles.userId, user.profile.id))
      .orderBy(desc(uploadedFiles.createdAt));
    return Response.json({ files });
  } catch (error) {
    console.error('Media list error:', error);
    return Response.json({ error: 'Failed to load media', code: 'LIST_FAILED' }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');

  if (!file || !(file instanceof File)) {
    return Response.json(
      { error: 'No file provided', code: 'VALIDATION_ERROR' },
      { status: 400 },
    );
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return Response.json(
      { error: 'Unsupported file type', code: 'UNSUPPORTED_FILE_TYPE' },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_BYTES) {
    return Response.json(
      { error: 'File must be smaller than 500KB', code: 'FILE_TOO_LARGE' },
      { status: 400 },
    );
  }

  // The browser's claimed type and the file name are just claims: check what
  // the bytes actually are, so an executable renamed to .png (or HTML sent as
  // "image/png") is refused.
  const sniffed = sniffImage(new Uint8Array(await file.arrayBuffer()));

  if (sniffed.kind === null) {
    return Response.json(
      sniffed.reason === 'unsafe-svg'
        ? { error: 'SVG files with scripts are not allowed', code: 'UNSAFE_SVG' }
        : { error: 'That file is not a valid image', code: 'UNSUPPORTED_FILE_TYPE' },
      { status: 400 },
    );
  }
  if (MIME_FOR_KIND[sniffed.kind] !== file.type) {
    return Response.json(
      { error: 'The file content does not match its type', code: 'UNSUPPORTED_FILE_TYPE' },
      { status: 400 },
    );
  }

  // Extension comes from the verified type, never from the uploaded name, so a
  // crafted name cannot add path segments to where the file is stored.
  const storagePath = `${user.profile.id}/${nanoid()}.${EXTENSION_FOR_KIND[sniffed.kind]}`;
  const displayName = file.name.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200);

  try {
    const { publicUrl } = await uploadFile(file, storagePath, file.type);

    const [record] = await db
      .insert(uploadedFiles)
      .values({
        userId: user.profile.id,
        fileName: displayName,
        fileSize: file.size,
        mimeType: file.type,
        storagePath,
        publicUrl,
      })
      .returning();

    return Response.json({ ...record, url: publicUrl }, { status: 201 });
  } catch (error) {
    console.error('File upload error:', error);
    return Response.json(
      { error: 'Failed to upload file', code: 'UPLOAD_FAILED' },
      { status: 500 },
    );
  }
}
