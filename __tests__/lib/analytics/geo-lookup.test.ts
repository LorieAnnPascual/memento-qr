import { describe, it, expect, vi, afterEach } from 'vitest';

import { lookupGeo } from '@/lib/analytics/geo-lookup';

describe('lookupGeo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null for private/local IPs without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', 'unknown', 'localhost']) {
      expect(await lookupGeo(ip)).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns geo data on a successful lookup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: 'success',
            country: 'Philippines',
            countryCode: 'PH',
            regionName: 'Metro Manila',
            city: 'Manila',
            lat: 14.5995,
            lon: 120.9842,
          }),
      }),
    );

    const result = await lookupGeo('8.8.8.8');
    expect(result).toEqual({
      country: 'Philippines',
      countryCode: 'PH',
      region: 'Metro Manila',
      city: 'Manila',
      lat: 14.5995,
      lon: 120.9842,
    });
  });

  it('returns null when the API reports failure status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ status: 'fail' }) }),
    );

    expect(await lookupGeo('8.8.8.8')).toBeNull();
  });

  it('returns null on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    expect(await lookupGeo('8.8.8.8')).toBeNull();
  });

  it('returns null when the request is aborted (timeout)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.reject(new DOMException('Aborted', 'AbortError'))),
    );

    expect(await lookupGeo('8.8.8.8')).toBeNull();
  });
});
