import { safeHostedVideoUrl } from '@/lib/pages/sanitize';
import { buildMediaUrl, storagePathFromMediaUrl } from '@/lib/upload/media-types';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The own-domain `/media/...` address a video code's stored target should play from, or
 * null when the target is not one of our hosted videos (so nothing else can ever be put
 * in the player, however the row came to hold it).
 */
export function playableVideoUrl(target: string | null | undefined): string | null {
  const safe = safeHostedVideoUrl(target ?? undefined);
  const path = safe ? storagePathFromMediaUrl(safe.startsWith('/') ? `http://x${safe}` : safe) : null;
  return path ? buildMediaUrl(path) : null;
}

/** What the player page may load: its own domain's /media/ files (and storage, in case a redirect is ever involved), nothing else, no scripts. */
export function videoPlayerCsp(): string {
  let storage = '';
  try {
    storage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin;
  } catch {
    storage = '';
  }
  return [
    "default-src 'none'",
    `media-src 'self'${storage ? ` ${storage}` : ''}`,
    "style-src 'unsafe-inline'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/** A bare full-screen player: no scripts, every value escaped. */
export function renderVideoPlayerHtml({ title, src }: { title: string; src: string }): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><style>html,body{margin:0;height:100%;background:#000}video{display:block;width:100%;height:100%;max-height:100vh;object-fit:contain;background:#000}</style></head><body><video controls playsinline preload="metadata" src="${escapeHtml(src)}"></video></body></html>`;
}
