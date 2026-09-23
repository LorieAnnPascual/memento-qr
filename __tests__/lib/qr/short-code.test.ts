import { describe, it, expect, afterEach, vi } from 'vitest';

import { buildRedirectUrl, generateShortCode } from '@/lib/qr/short-code';

const SAFE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

describe('generateShortCode', () => {
  it('generates a 6-character code', () => {
    expect(generateShortCode()).toHaveLength(6);
  });

  it('only uses characters from the safe alphabet', () => {
    const code = generateShortCode();
    for (const char of code) {
      expect(SAFE_ALPHABET).toContain(char);
    }
  });

  it('excludes ambiguous characters (0, O, 1, l, I)', () => {
    for (const ambiguous of ['0', 'O', '1', 'l', 'I']) {
      expect(SAFE_ALPHABET).not.toContain(ambiguous);
    }
  });

  it('generates unique codes across a large batch', () => {
    // Kept well under the ~1B possible 6-char codes so the expected
    // collision probability stays negligible (birthday-paradox-safe).
    const sampleSize = 2_000;
    const codes = new Set<string>();
    for (let i = 0; i < sampleSize; i++) {
      codes.add(generateShortCode());
    }
    expect(codes.size).toBe(sampleSize);
  });
});

describe('buildRedirectUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds a /q/ URL from the configured app URL', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://memento-qr.vercel.app');
    expect(buildRedirectUrl('k7m2x9')).toBe('https://memento-qr.vercel.app/q/k7m2x9');
  });

  it('strips a trailing slash from the app URL', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://memento-qr.vercel.app/');
    expect(buildRedirectUrl('k7m2x9')).toBe('https://memento-qr.vercel.app/q/k7m2x9');
  });

  it('falls back to localhost when the app URL is not set', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    expect(buildRedirectUrl('k7m2x9')).toBe('http://localhost:3000/q/k7m2x9');
  });
});
