import { describe, it, expect } from 'vitest';

import { safeRedirectPath } from '@/lib/auth/redirect';

describe('safeRedirectPath', () => {
  it('keeps same-site paths, including query strings', () => {
    expect(safeRedirectPath('/qr')).toBe('/qr');
    expect(safeRedirectPath('/qr/abc?tab=analytics#top')).toBe('/qr/abc?tab=analytics#top');
  });

  it('falls back when there is nothing to redirect to', () => {
    expect(safeRedirectPath(null)).toBe('/');
    expect(safeRedirectPath(undefined)).toBe('/');
    expect(safeRedirectPath('')).toBe('/');
    expect(safeRedirectPath(null, '/qr')).toBe('/qr');
  });

  it.each([
    'https://evil.example',
    'http://evil.example/phish',
    '//evil.example',
    '///evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    'evil.example',
    'qr',
    '/qr\n//evil.example',
    '/\t/evil.example',
  ])('rejects %j', (value) => {
    expect(safeRedirectPath(value)).toBe('/');
  });
});
