import type { UploadedFile } from '@/lib/db/schema';

import { MAX_VIDEO_BYTES, formatBytes, videoKindForFile } from './media-types';

export type UploadedVideo = UploadedFile & { url: string };

interface SignResponse {
  path: string;
  token: string;
  contentType: string;
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

/** Why a file cannot be uploaded as a video, or null when it looks fine (the server checks the bytes again). */
export function videoProblem(file: { name: string; type: string; size: number }): string | null {
  if (!videoKindForFile(file)) return 'Videos must be MP4, WebM or MOV files.';
  if (file.size > MAX_VIDEO_BYTES) {
    return `That video is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_VIDEO_BYTES)}; compress or trim it first.`;
  }
  return null;
}

function putWithProgress(url: string, body: FormData, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    // Same headers the Supabase client sends; the one-time token in the URL is what authorizes the upload.
    request.setRequestHeader('apikey', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    request.setRequestHeader('Authorization', `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`);
    request.setRequestHeader('x-upsert', 'false');

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onerror = () => reject(new Error('The upload was interrupted. Check your connection and try again.'));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }
      reject(
        new Error(
          request.status === 413
            ? 'Storage refused the file because it is too large.'
            : `The upload failed (${request.status}). Please try again.`,
        ),
      );
    };
    request.send(body);
  });
}

/**
 * Uploads a video straight to storage in three steps: ask the server for a
 * one-time link, send the file there (with progress), then have the server
 * verify what arrived and add it to the library.
 */
export async function uploadVideo(file: File, onProgress: (fraction: number) => void = () => {}): Promise<UploadedVideo> {
  const problem = videoProblem(file);
  if (problem) throw new Error(problem);

  const signResponse = await fetch('/api/upload/video/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, size: file.size, type: file.type }),
  });
  if (!signResponse.ok) throw new Error(await errorMessage(signResponse, 'Could not start the upload.'));
  const { path, token, contentType } = (await signResponse.json()) as SignResponse;

  const form = new FormData();
  form.append('cacheControl', '3600');
  // The type is set here because some browsers report none for .mov files.
  form.append('', file.slice(0, file.size, contentType));
  const uploadUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/uploads/${path}?token=${encodeURIComponent(token)}`;
  await putWithProgress(uploadUrl, form, onProgress);

  const completeResponse = await fetch('/api/upload/video/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, fileName: file.name }),
  });
  if (!completeResponse.ok) throw new Error(await errorMessage(completeResponse, 'Could not finish the upload.'));
  return (await completeResponse.json()) as UploadedVideo;
}
