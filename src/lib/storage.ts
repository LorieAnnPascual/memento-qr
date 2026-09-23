import { createClient as createServiceClient } from '@supabase/supabase-js';

const UPLOADS_BUCKET = 'uploads';

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface UploadedFileResult {
  storagePath: string;
  publicUrl: string;
}

export async function uploadFile(
  file: Blob,
  path: string,
  contentType: string,
): Promise<UploadedFileResult> {
  const supabase = getServiceClient();

  const { error } = await supabase.storage.from(UPLOADS_BUCKET).upload(path, file, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(UPLOADS_BUCKET).getPublicUrl(path);

  return { storagePath: path, publicUrl };
}

export async function deleteFile(path: string): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase.storage.from(UPLOADS_BUCKET).remove([path]);

  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}
