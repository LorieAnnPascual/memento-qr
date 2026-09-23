import { describe, it, expect } from 'vitest';

import {
  resolveFontStack,
  safeColor,
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
