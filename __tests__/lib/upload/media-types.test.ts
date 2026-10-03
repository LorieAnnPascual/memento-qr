import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { buildMediaUrl, storagePathFromMediaUrl, toOwnMediaUrl } from '@/lib/upload/media-types';

describe('own-domain media addresses', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://memento-qr.vercel.app/');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds /media/<folder>/<file> on the app address without doubling the slash', () => {
    expect(buildMediaUrl('abc/def.mp4')).toBe('https://memento-qr.vercel.app/media/abc/def.mp4');
  });

  it('falls back to localhost in development', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');

    expect(buildMediaUrl('abc/def.mp4')).toBe('http://localhost:3000/media/abc/def.mp4');
  });

  it('reads the storage path from either kind of address', () => {
    expect(storagePathFromMediaUrl('https://proj.supabase.co/storage/v1/object/public/uploads/abc/def.mp4')).toBe('abc/def.mp4');
    expect(storagePathFromMediaUrl('https://memento-qr.vercel.app/media/abc/def.mp4')).toBe('abc/def.mp4');
  });

  it('gives no path for anything else', () => {
    for (const url of ['https://example.com/a/b.mp4', 'https://x.co/media/a/b/c.mp4', 'not a url', '/media/a/b.mp4']) {
      expect(storagePathFromMediaUrl(url)).toBeNull();
    }
  });

  it('upgrades an older storage address and leaves everything else alone', () => {
    expect(toOwnMediaUrl('https://proj.supabase.co/storage/v1/object/public/uploads/abc/def.mp4')).toBe(
      'https://memento-qr.vercel.app/media/abc/def.mp4',
    );
    expect(toOwnMediaUrl('https://memento-qr.vercel.app/media/abc/def.mp4')).toBe(
      'https://memento-qr.vercel.app/media/abc/def.mp4',
    );
    expect(toOwnMediaUrl('https://example.com/x.mp4')).toBe('https://example.com/x.mp4');
  });
});
