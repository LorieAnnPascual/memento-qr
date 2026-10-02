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

export interface SignedUpload {
  path: string;
  token: string;
}

/** A one-time link that lets the browser upload straight to storage (bypassing Vercel's request size limit). */
export async function createSignedUpload(path: string): Promise<SignedUpload> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.storage.from(UPLOADS_BUCKET).createSignedUploadUrl(path);

  if (error || !data) {
    throw new Error(`Failed to prepare upload: ${error?.message ?? 'no data'}`);
  }
  return { path: data.path, token: data.token };
}

export interface StoredObjectInfo {
  size: number;
  contentType: string;
  publicUrl: string;
}

/** What storage actually holds at `path`, or null when nothing is there. */
export async function getStoredObject(path: string): Promise<StoredObjectInfo | null> {
  const supabase = getServiceClient();
  const bucket = supabase.storage.from(UPLOADS_BUCKET);
  const { data, error } = await bucket.info(path);

  if (error || !data) return null;

  return {
    size: data.size ?? 0,
    contentType: data.contentType ?? '',
    publicUrl: bucket.getPublicUrl(path).data.publicUrl,
  };
}

/** The first bytes of a stored file, used to check it really is what its name says. */
export async function readStoredHead(publicUrl: string, length = 4096): Promise<Uint8Array> {
  const response = await fetch(publicUrl, { headers: { Range: `bytes=0-${length - 1}` }, cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Failed to read stored file: ${response.status}`);
  }
  return new Uint8Array((await response.arrayBuffer()).slice(0, length));
}
