export interface GeoResult {
  country: string;
  countryCode: string;
  region: string;
  city: string;
  lat: number;
  lon: number;
}

const PRIVATE_IP_REGEX = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|localhost|unknown)/;

interface IpApiResponse {
  status: string;
  country?: string;
  countryCode?: string;
  regionName?: string;
  city?: string;
  lat?: number;
  lon?: number;
}

/** Looks up approximate (city-level) geolocation for an IP. Times out at 2s and returns null on any failure — a geo lookup must never block a QR redirect. */
export async function lookupGeo(ip: string): Promise<GeoResult | null> {
  if (PRIVATE_IP_REGEX.test(ip)) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(
      `http://ip-api.com/json/${ip}?fields=country,countryCode,regionName,city,lat,lon,status`,
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    const data = (await response.json()) as IpApiResponse;

    if (data.status !== 'success') return null;

    return {
      country: data.country ?? '',
      countryCode: data.countryCode ?? '',
      region: data.regionName ?? '',
      city: data.city ?? '',
      lat: data.lat ?? 0,
      lon: data.lon ?? 0,
    };
  } catch {
    return null;
  }
}
