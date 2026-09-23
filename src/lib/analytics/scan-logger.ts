import { db } from '@/lib/db';
import { scanEvents } from '@/lib/db/schema';
import { parseDevice } from './device-parser';
import { lookupGeo } from './geo-lookup';

// Salted so the hash can't be reversed by brute-forcing the IPv4 space.
// Falls back to CRON_SECRET so no extra setup is needed; set IP_HASH_SALT to
// override. Changing the salt splits "unique visitor" counts at that point.
function getIpHashSalt(): string {
  return process.env.IP_HASH_SALT || process.env.CRON_SECRET || '';
}

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`${getIpHashSalt()}:${ip}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Logs a scan event for a dynamic QR redirect. Called fire-and-forget by the redirect handler — never awaited on the critical path. */
export async function logScanEvent(qrCodeId: string, request: Request): Promise<void> {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  const userAgent = request.headers.get('user-agent') || '';
  const referrer = request.headers.get('referer') || '';

  const [ipHash, device, geo] = await Promise.all([
    hashIp(ip),
    Promise.resolve(parseDevice(userAgent)),
    lookupGeo(ip),
  ]);

  await db.insert(scanEvents).values({
    qrCodeId,
    ipHash,
    userAgent,
    referrer,
    deviceType: device.type,
    browser: device.browser,
    os: device.os,
    country: geo?.country || null,
    countryCode: geo?.countryCode || null,
    region: geo?.region || null,
    city: geo?.city || null,
    latitude: geo?.lat ?? null,
    longitude: geo?.lon ?? null,
  });
}
