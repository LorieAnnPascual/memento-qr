import { nanoid } from 'nanoid';
import { z } from 'zod';

import { getCurrentUser } from '@/lib/auth/get-current-user';
import { createSignedUpload } from '@/lib/storage';
import {
  MAX_VIDEO_BYTES,
  VIDEO_EXTENSION_FOR_KIND,
  VIDEO_MIME_FOR_KIND,
  videoKindForFile,
} from '@/lib/upload/media-types';

const SignSchema = z.object({
  fileName: z.string().min(1).max(300),
  size: z.number().int().positive(),
  type: z.string().max(100),
});

/**
 * Step 1 of a video upload: checks the request and hands the browser a one-time
 * link to upload straight to storage. The file itself is verified in step 2
 * (`/complete`), because nothing here has seen its bytes yet.
 */
export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const parsed = SignSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const { fileName, size, type } = parsed.data;
  const kind = videoKindForFile({ name: fileName, type });

  if (!kind) {
    return Response.json(
      { error: 'Videos must be MP4, WebM or MOV files', code: 'UNSUPPORTED_FILE_TYPE' },
      { status: 400 },
    );
  }
  if (size > MAX_VIDEO_BYTES) {
    return Response.json(
      { error: `Videos must be smaller than ${MAX_VIDEO_BYTES / (1024 * 1024)} MB`, code: 'FILE_TOO_LARGE' },
      { status: 400 },
    );
  }

  // Extension comes from the verified type, never from the uploaded name.
  const storagePath = `${user.profile.id}/${nanoid()}.${VIDEO_EXTENSION_FOR_KIND[kind]}`;

  try {
    const { path, token } = await createSignedUpload(storagePath);
    return Response.json({ path, token, contentType: VIDEO_MIME_FOR_KIND[kind] });
  } catch (error) {
    console.error('Video upload sign error:', error);
    return Response.json({ error: 'Failed to prepare the upload', code: 'UPLOAD_FAILED' }, { status: 500 });
  }
}
