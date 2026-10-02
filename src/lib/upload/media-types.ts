/**
 * What the Media library accepts, shared by the browser and the server.
 * Images go through our own API (small); videos upload straight to storage
 * because Vercel rejects request bodies over ~4.5 MB.
 */

export const MAX_IMAGE_BYTES = 500 * 1024;

/** Supabase's free plan refuses single files over 50 MB, so this is the most we can promise. */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export type VideoKind = 'mp4' | 'webm' | 'mov';

export const VIDEO_MIME_FOR_KIND: Record<VideoKind, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

/** Stored extension, chosen from the verified type and never from the uploaded file name. */
export const VIDEO_EXTENSION_FOR_KIND: Record<VideoKind, string> = {
  mp4: 'mp4',
  webm: 'webm',
  mov: 'mov',
};

export const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov';
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';

export function isVideoMime(mimeType: string): boolean {
  return Object.values(VIDEO_MIME_FOR_KIND).includes(mimeType);
}

export function videoKindForMime(mimeType: string): VideoKind | null {
  const entry = Object.entries(VIDEO_MIME_FOR_KIND).find(([, mime]) => mime === mimeType);
  return entry ? (entry[0] as VideoKind) : null;
}

/** Browsers sometimes report an empty type for .mov; fall back to the extension (the server re-checks the bytes). */
export function videoKindForFile(file: { name: string; type: string }): VideoKind | null {
  const fromType = videoKindForMime(file.type);
  if (fromType) return fromType;
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  return extension === 'mp4' || extension === 'webm' || extension === 'mov' ? extension : null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Supabase's free plan stores 1 GB in total, shared by every image and video. */
export const FREE_STORAGE_BYTES = 1024 * 1024 * 1024;

/**
 * Whether the bytes found in a file fit the extension it was stored under. MP4 and
 * MOV are the same container, so either name may hold either; WebM is its own format.
 */
export function bytesFitExtension(found: VideoKind | null, extension: VideoKind): boolean {
  if (found === null) return false;
  return extension === 'webm' ? found === 'webm' : found !== 'webm';
}
