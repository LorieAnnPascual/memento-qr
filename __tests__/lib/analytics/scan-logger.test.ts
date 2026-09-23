import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const insertValuesMock = vi.fn().mockResolvedValue(undefined);
const lookupGeoMock = vi.fn();

vi.mock('@/lib/db', () => ({ db: { insert: () => ({ values: insertValuesMock }) } }));
vi.mock('@/lib/analytics/geo-lookup', () => ({ lookupGeo: lookupGeoMock }));

const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function req(headers: Record<string, string>): Request {
  return new Request('http://localhost:3000/q/abc123', { headers });
}

describe('logScanEvent', () => {
  beforeEach(() => {
    insertValuesMock.mockClear();
    lookupGeoMock.mockReset().mockResolvedValue(null);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('stores a hashed IP, never the raw address', async () => {
    const { logScanEvent } = await import('@/lib/analytics/scan-logger');
    await logScanEvent('qr-1', req({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1', 'user-agent': CHROME }));

    const row = insertValuesMock.mock.calls[0][0];
    expect(row.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain('203.0.113.9');
    expect(lookupGeoMock).toHaveBeenCalledWith('203.0.113.9');
  });

  it('salts the hash so it differs from a plain SHA-256 of the IP', async () => {
    vi.stubEnv('IP_HASH_SALT', 'pepper');
    const { logScanEvent } = await import('@/lib/analytics/scan-logger');
    await logScanEvent('qr-1', req({ 'x-forwarded-for': '203.0.113.9' }));

    const plain = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('203.0.113.9'))),
    )
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    expect(insertValuesMock.mock.calls[0][0].ipHash).not.toBe(plain);
  });

  it('records parsed device info and geo when available', async () => {
    lookupGeoMock.mockResolvedValue({
      country: 'Philippines', countryCode: 'PH', region: 'NCR', city: 'Manila', lat: 14.6, lon: 121,
    });
    const { logScanEvent } = await import('@/lib/analytics/scan-logger');
    await logScanEvent('qr-1', req({ 'x-real-ip': '198.51.100.4', 'user-agent': CHROME, referer: 'https://x.com' }));

    expect(insertValuesMock.mock.calls[0][0]).toMatchObject({
      qrCodeId: 'qr-1', deviceType: 'desktop', browser: 'Chrome', os: 'Windows',
      country: 'Philippines', city: 'Manila', referrer: 'https://x.com',
    });
  });

  it('still logs the scan with null geo when the lookup fails', async () => {
    const { logScanEvent } = await import('@/lib/analytics/scan-logger');
    await logScanEvent('qr-1', req({ 'user-agent': CHROME }));

    expect(insertValuesMock.mock.calls[0][0]).toMatchObject({ country: null, city: null, latitude: null });
  });
});
