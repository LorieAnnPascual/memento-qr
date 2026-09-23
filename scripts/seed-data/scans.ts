import { createHash } from 'node:crypto';

import { LIMITED_SCANS_LOGGED, QA_CODES, SEED_RANDOM, TOTAL_SCAN_EVENTS } from './constants';

export interface SeedScan {
  shortCode: string;
  scannedAt: Date;
  ipHash: string;
  userAgent: string;
  referrer: string | null;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  browser: string;
  os: string;
  country: string;
  countryCode: string;
  region: string;
  city: string;
  latitude: number;
  longitude: number;
}

/** Small deterministic PRNG so every run produces the same 200 scans. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEVICES = [
  { deviceType: 'mobile', browser: 'Safari', os: 'iOS', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' },
  { deviceType: 'mobile', browser: 'Chrome', os: 'Android', userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' },
  { deviceType: 'desktop', browser: 'Chrome', os: 'Windows', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
  { deviceType: 'desktop', browser: 'Firefox', os: 'macOS', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:120.0) Gecko/20100101 Firefox/120.0' },
  { deviceType: 'tablet', browser: 'Safari', os: 'iPadOS', userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' },
] as const;

const PLACES = [
  { country: 'Philippines', countryCode: 'PH', region: 'Metro Manila', city: 'Manila', latitude: 14.6, longitude: 120.98 },
  { country: 'Philippines', countryCode: 'PH', region: 'Cebu', city: 'Cebu City', latitude: 10.31, longitude: 123.89 },
  { country: 'United States', countryCode: 'US', region: 'California', city: 'San Francisco', latitude: 37.77, longitude: -122.42 },
  { country: 'Japan', countryCode: 'JP', region: 'Tokyo', city: 'Tokyo', latitude: 35.68, longitude: 139.69 },
  { country: 'Australia', countryCode: 'AU', region: 'New South Wales', city: 'Sydney', latitude: -33.87, longitude: 151.21 },
] as const;

const REFERRERS = [null, null, null, 'https://google.com/', 'https://facebook.com/'] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 200 scans over the past 30 days. The scan-limited code gets exactly
 * LIMITED_SCANS_LOGGED (9) so one more scan hits its limit of 10.
 */
export function generateScans(now: Date): SeedScan[] {
  const random = mulberry32(SEED_RANDOM);
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)];

  const others = [QA_CODES.activeA, QA_CODES.activeB, QA_CODES.paused, QA_CODES.expired];
  const codes: string[] = [
    ...Array<string>(LIMITED_SCANS_LOGGED).fill(QA_CODES.limited),
    ...Array.from({ length: TOTAL_SCAN_EVENTS - LIMITED_SCANS_LOGGED }, (_, i) => others[i % others.length]),
  ];

  return codes.map((shortCode, index) => {
    const device = pick(DEVICES);
    const place = pick(PLACES);
    // Recent days are busier; every scan is in the past, inside 30 days.
    const daysAgo = Math.floor(random() * random() * 30);
    const scannedAt = new Date(now.getTime() - daysAgo * DAY_MS - Math.floor(random() * DAY_MS * 0.9) - 60_000);

    return {
      shortCode,
      scannedAt,
      // Never a real address: hashed like production, from a made-up value.
      ipHash: createHash('sha256').update(`qa-visitor-${index % 60}`).digest('hex'),
      userAgent: device.userAgent,
      referrer: pick(REFERRERS),
      deviceType: device.deviceType,
      browser: device.browser,
      os: device.os,
      ...place,
    };
  });
}
