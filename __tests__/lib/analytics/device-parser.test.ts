import { describe, it, expect } from 'vitest';

import { parseDevice } from '@/lib/analytics/device-parser';

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const CHROME_ANDROID_TABLET =
  'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

describe('parseDevice', () => {
  it('parses a desktop Chrome/Windows user agent', () => {
    const result = parseDevice(CHROME_WINDOWS);
    expect(result).toEqual({ type: 'desktop', browser: 'Chrome', os: 'Windows' });
  });

  it('parses a mobile Safari/iPhone user agent', () => {
    const result = parseDevice(SAFARI_IPHONE);
    expect(result.type).toBe('mobile');
    expect(result.browser).toBe('Mobile Safari');
    expect(result.os).toBe('iOS');
  });

  it('parses a tablet user agent', () => {
    const result = parseDevice(CHROME_ANDROID_TABLET);
    expect(result.type).toBe('tablet');
  });

  it('defaults to desktop when the device type is not mobile or tablet', () => {
    const result = parseDevice(CHROME_WINDOWS);
    expect(result.type).toBe('desktop');
  });

  it('falls back to "Unknown" for an empty or unrecognized user agent', () => {
    const result = parseDevice('');
    expect(result).toEqual({ type: 'desktop', browser: 'Unknown', os: 'Unknown' });
  });
});
