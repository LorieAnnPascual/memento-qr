export interface DestinationCheck {
  /** `unchecked` = not a web link (tel:, mailto:, ...) or not allowed to be fetched. */
  result: 'reachable' | 'unreachable' | 'unchecked';
  httpStatus?: number;
  message: string;
}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

/** Only public web addresses are fetched: this server must not be pointed at internal hosts. */
export function isPublicWebUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (PRIVATE_HOST.test(url.hostname)) return null;
  return url;
}

/**
 * Asks the destination whether it answers. A page that is down or gone is the
 * most common way a printed QR code "stops working" without anyone noticing.
 */
export async function checkDestination(target: string, timeoutMs = 5000): Promise<DestinationCheck> {
  const url = isPublicWebUrl(target);

  if (!url) {
    return { result: 'unchecked', message: 'Not a public web link, so it can only be checked by scanning it.' };
  }

  const attempt = async (method: 'HEAD' | 'GET'): Promise<Response> =>
    fetch(url, { method, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'MementoQR-LinkCheck/1.0' } });

  try {
    let response = await attempt('HEAD');
    // Some sites refuse HEAD; a GET tells the real story.
    if (response.status === 405 || response.status === 501 || response.status === 403) response = await attempt('GET');

    if (response.ok || (response.status >= 300 && response.status < 400)) return { result: 'reachable', httpStatus: response.status, message: `The destination answered (HTTP ${response.status}).` };
    return { result: 'unreachable', httpStatus: response.status, message: `The destination returned HTTP ${response.status}. The page may be down or moved.` };
  } catch {
    return { result: 'unreachable', message: 'The destination did not answer in time. The site may be down.' };
  }
}
