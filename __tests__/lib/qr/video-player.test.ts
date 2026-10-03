import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { playableVideoUrl, renderVideoPlayerHtml, videoPlayerCsp } from '@/lib/qr/video-player';

const APP = 'https://memento-qr.vercel.app';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', APP);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('playableVideoUrl', () => {
  it('keeps an own-domain address', () => {
    expect(playableVideoUrl(`${APP}/media/abc/def.mp4`)).toBe(`${APP}/media/abc/def.mp4`);
  });

  it('turns an older storage address into the own-domain one', () => {
    expect(playableVideoUrl('https://proj.supabase.co/storage/v1/object/public/uploads/abc/def.webm')).toBe(
      `${APP}/media/abc/def.webm`,
    );
  });

  it('refuses everything that is not one of our hosted videos', () => {
    for (const target of [null, undefined, '', 'https://example.com/a.mp4', `${APP}/media/a/b.html`, 'javascript:alert(1)']) {
      expect(playableVideoUrl(target)).toBeNull();
    }
  });
});

describe('renderVideoPlayerHtml', () => {
  it('is a bare player with no scripts', () => {
    const html = renderVideoPlayerHtml({ title: 'Clip', src: `${APP}/media/a/b.mp4` });

    expect(html).toContain('<video controls playsinline preload="metadata"');
    expect(html).toContain('background:#000');
    expect(html).not.toContain('<script');
  });

  it('escapes the title and the address', () => {
    const html = renderVideoPlayerHtml({ title: '<b>"hi"</b>', src: 'x" onerror="alert(1)' });

    expect(html).toContain('<title>&lt;b&gt;&quot;hi&quot;&lt;/b&gt;</title>');
    expect(html).toContain('src="x&quot; onerror=&quot;alert(1)"');
  });
});

describe('videoPlayerCsp', () => {
  it('allows only our own media and inline styles', () => {
    expect(videoPlayerCsp()).toBe(
      "default-src 'none'; media-src 'self' https://proj.supabase.co; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    );
  });

  it('works when the storage address is unknown', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');

    expect(videoPlayerCsp()).toContain("media-src 'self';");
  });
});
