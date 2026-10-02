import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  resolveFontStack,
  safeColor,
  safeHostedVideoUrl,
  safeImageUrl,
  safeLinkUrl,
  toMapEmbedUrl,
  toVideoEmbedUrl,
} from '@/lib/pages/sanitize';

describe('safeLinkUrl', () => {
  it('allows http, https, mailto, tel, relative and anchor links', () => {
    for (const url of ['https://a.com/x', 'http://a.com', 'mailto:a@b.com', 'tel:+639171234567', '/about', '#top']) {
      expect(safeLinkUrl(url)).toBe(url);
    }
  });

  it('blocks javascript:, data:, vbscript: and malformed URLs', () => {
    for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>', 'vbscript:x', 'not a url', '']) {
      expect(safeLinkUrl(url)).toBe('');
    }
  });

  it('treats undefined as empty', () => {
    expect(safeLinkUrl(undefined)).toBe('');
  });
});

describe('safeImageUrl', () => {
  it('allows http(s) and same-site paths', () => {
    expect(safeImageUrl('https://a.com/i.png')).toBe('https://a.com/i.png');
    expect(safeImageUrl('/uploads/i.png')).toBe('/uploads/i.png');
  });

  it('blocks data:, javascript: and protocol-relative URLs', () => {
    for (const url of ['data:image/svg+xml,<svg onload=alert(1)>', 'javascript:alert(1)', '//evil.com/x.png', 'mailto:a@b.com']) {
      expect(safeImageUrl(url)).toBe('');
    }
  });
});

describe('safeColor', () => {
  it('accepts hex colors', () => {
    expect(safeColor('#fff', '#000')).toBe('#fff');
    expect(safeColor('#1A2b3C', '#000')).toBe('#1A2b3C');
  });

  it('falls back for anything that could escape a style declaration', () => {
    for (const value of ['red; background:url(x)', 'url(javascript:x)', 'expression(x)', '#12', 'rgb(0,0,0)', '']) {
      expect(safeColor(value, '#123456')).toBe('#123456');
    }
  });
});

describe('toVideoEmbedUrl', () => {
  it('converts YouTube watch, short and embed URLs', () => {
    expect(toVideoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(toVideoEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(toVideoEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('converts Vimeo URLs', () => {
    expect(toVideoEmbedUrl('https://vimeo.com/123456789')).toBe('https://player.vimeo.com/video/123456789');
  });

  it('rejects other hosts, look-alike hosts and bad ids', () => {
    for (const url of [
      'https://evil.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v="><script>',
      'javascript:alert(1)',
      'https://vimeo.com/abc',
      '',
    ]) {
      expect(toVideoEmbedUrl(url)).toBe('');
    }
  });
});

describe('toMapEmbedUrl', () => {
  it('encodes the address into a Google Maps embed URL', () => {
    expect(toMapEmbedUrl('1 Main St & Co')).toBe('https://maps.google.com/maps?q=1%20Main%20St%20%26%20Co&output=embed');
  });

  it('returns empty for a blank address', () => {
    expect(toMapEmbedUrl('  ')).toBe('');
  });
});

describe('resolveFontStack', () => {
  it('maps known keys and defaults to sans', () => {
    expect(resolveFontStack('serif')).toContain('Georgia');
    expect(resolveFontStack('nope')).toContain('Roboto');
    expect(resolveFontStack(undefined)).toContain('Roboto');
  });
});

describe('safeHostedVideoUrl', () => {
  const STORAGE = 'https://proj.supabase.co';
  const good = `${STORAGE}/storage/v1/object/public/uploads/abc/def.mp4`;

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', STORAGE);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts a video from our own storage bucket', () => {
    for (const ext of ['mp4', 'webm', 'mov', 'MP4']) {
      const url = `${STORAGE}/storage/v1/object/public/uploads/abc/def.${ext}`;
      expect(safeHostedVideoUrl(url)).toBe(url);
    }
  });

  it('drops the query string and fragment', () => {
    expect(safeHostedVideoUrl(`${good}?download=1#t=5`)).toBe(good);
  });

  it('refuses videos from anywhere else', () => {
    for (const url of [
      'https://evil.example/storage/v1/object/public/uploads/a/b.mp4',
      'https://proj.supabase.co.evil.example/storage/v1/object/public/uploads/a/b.mp4',
      'http://proj.supabase.co/storage/v1/object/public/uploads/a/b.mp4',
      '//evil.example/a.mp4',
      '/storage/v1/object/public/uploads/a/b.mp4',
    ]) {
      expect(safeHostedVideoUrl(url)).toBe('');
    }
  });

  it('refuses other buckets, other file types and path tricks', () => {
    for (const url of [
      `${STORAGE}/storage/v1/object/public/private/a/b.mp4`,
      `${STORAGE}/storage/v1/object/public/uploads/a/b.html`,
      `${STORAGE}/storage/v1/object/public/uploads/a/b.png`,
      `${STORAGE}/storage/v1/object/public/uploads/../../private/b.mp4`,
      'javascript:alert(1)',
      'data:video/mp4;base64,AAAA',
    ]) {
      expect(safeHostedVideoUrl(url)).toBe('');
    }
  });

  it('refuses everything when the storage address is not configured', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');

    expect(safeHostedVideoUrl(good)).toBe('');
    expect(safeHostedVideoUrl(undefined)).toBe('');
  });
});
