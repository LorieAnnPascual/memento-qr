import { describe, it, expect, vi, afterEach } from 'vitest';

import { buildPublishedUrl, toPublishStatus } from '@/lib/pages/page-status';
import { parseExpiry } from '@/lib/pages/schemas';

const HOUR = 60 * 60 * 1000;

describe('toPublishStatus', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reports a published page with its URL', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://memento-qr.vercel.app/');
    const status = toPublishStatus({ isPublished: true, shortCode: 'abc123', publishedAt: new Date(), expiresAt: null });

    expect(status.publishedUrl).toBe('https://memento-qr.vercel.app/p/abc123');
    expect(status.isExpired).toBe(false);
  });

  it('flags an expired page', () => {
    const status = toPublishStatus({
      isPublished: true,
      shortCode: 'abc123',
      publishedAt: new Date(),
      expiresAt: new Date(Date.now() - HOUR),
    });
    expect(status.isExpired).toBe(true);
  });

  it('reports an unpublished page that never had a code', () => {
    const status = toPublishStatus({ isPublished: false, shortCode: null, publishedAt: null, expiresAt: null });
    expect(status.publishedUrl).toBeNull();
    expect(status.isPublished).toBe(false);
  });

  it('keeps the URL for an unpublished page that was published before', () => {
    const status = toPublishStatus({ isPublished: false, shortCode: 'abc123', publishedAt: new Date(), expiresAt: null });
    expect(status.publishedUrl).toContain('/p/abc123');
  });

  it('falls back to localhost without an app URL', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    expect(buildPublishedUrl('abc123')).toBe('http://localhost:3000/p/abc123');
  });
});

describe('parseExpiry', () => {
  it('passes through undefined and null', () => {
    expect(parseExpiry(undefined)).toEqual({ ok: true, value: undefined });
    expect(parseExpiry(null)).toEqual({ ok: true, value: null });
  });

  it('accepts a future date', () => {
    expect(parseExpiry(new Date(Date.now() + HOUR).toISOString()).ok).toBe(true);
  });

  it('rejects past and invalid dates', () => {
    expect(parseExpiry(new Date(Date.now() - HOUR).toISOString())).toMatchObject({ ok: false });
    expect(parseExpiry('nonsense')).toMatchObject({ ok: false });
  });
});
