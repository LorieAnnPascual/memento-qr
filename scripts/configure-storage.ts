/**
 * Sets the size limit on the `uploads` storage bucket so videos can be stored.
 * Images are still capped at 500 KB by the app itself (`/api/upload`); this is
 * the ceiling storage enforces for everything, so it must be at least the
 * largest video the app accepts. Safe to run again.
 *
 *   pnpm storage:configure
 *
 * Supabase's free plan also has a project-wide limit (Dashboard -> Storage ->
 * Settings, 50 MB by default) that this cannot raise.
 */
import './lib/load-env';
import { createClient } from '@supabase/supabase-js';

import { MAX_VIDEO_BYTES } from '../src/lib/upload/media-types';

async function main(): Promise<void> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: bucket, error: readError } = await supabase.storage.getBucket('uploads');
  if (readError || !bucket) throw new Error(`Could not read the uploads bucket: ${readError?.message}`);

  console.log(`before: public=${bucket.public}, file_size_limit=${bucket.file_size_limit}`);

  const { error } = await supabase.storage.updateBucket('uploads', {
    public: bucket.public,
    fileSizeLimit: MAX_VIDEO_BYTES,
    allowedMimeTypes: bucket.allowed_mime_types ?? undefined,
  });
  if (error) throw new Error(`Could not update the uploads bucket: ${error.message}`);

  const { data: after } = await supabase.storage.getBucket('uploads');
  console.log(`after:  public=${after?.public}, file_size_limit=${after?.file_size_limit}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
