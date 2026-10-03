import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { chainable, createDbMock } from '../helpers/db-mock';

const dbMock = createDbMock();
const logScanEventMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/analytics/scan-logger', () => ({ logScanEvent: logScanEventMock }));

const BASE_QR = {
  id: 'qr-1',
  targetUrl: 'https://example.com',
  isPaused: false,
  expiresAt: null,
  scanLimit: null,
  scanCount: 0,
  deletedAt: null,
};

function makeRequest(shortCode: string): Request {
  return new Request(`http://localhost:3000/q/${shortCode}`);
}

async function scan(shortCode = 'abc123'): Promise<Response> {
  const { GET } = await import('@/app/q/[shortCode]/route');
  return GET(makeRequest(shortCode), { params: Promise.resolve({ shortCode }) });
}

/** The single "claim" statement succeeds and returns the row it counted. */
function claimSucceeds(targetUrl = BASE_QR.targetUrl): void {
  dbMock.update.mockReturnValueOnce(chainable([{ id: BASE_QR.id, targetUrl, qrType: 'url', name: 'Test code' }]));
}

/**
 * The claim matches nothing. The route checks whether the link is an old name of a renamed
 * code (none here), then looks the code up to explain why.
 */
function claimRefused(row: Record<string, unknown> | null): void {
  dbMock.update.mockReturnValueOnce(chainable([]));
  dbMock.select.mockReturnValueOnce(chainable([])); // no old-name record
  dbMock.select.mockReturnValueOnce(chainable(row ? [row] : []));
}

describe('GET /q/[shortCode]', () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    dbMock.update.mockReset();
    logScanEventMock.mockClear();
  });

  it('redirects to the target URL for a valid, active code', async () => {
    claimSucceeds();

    const response = await scan();

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://example.com/');
  });

  it('needs only one database round trip on the happy path', async () => {
    claimSucceeds();

    await scan();

    expect(dbMock.update).toHaveBeenCalledTimes(1);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('logs a scan event without blocking the redirect', async () => {
    claimSucceeds();

    await scan();

    expect(logScanEventMock).toHaveBeenCalledWith('qr-1', expect.any(Request));
  });

  it('still redirects if scan logging fails', async () => {
    claimSucceeds();
    logScanEventMock.mockRejectedValueOnce(new Error('geo down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await scan();

    expect(response.status).toBe(302);
    await Promise.resolve();
    spy.mockRestore();
  });

  it('returns 404 for an unknown short code', async () => {
    claimRefused(null);

    const response = await scan('missing');

    expect(response.status).toBe(404);
    expect(logScanEventMock).not.toHaveBeenCalled();
  });

  it('returns 404 for a soft-deleted QR code', async () => {
    claimRefused({ ...BASE_QR, deletedAt: new Date() });

    expect((await scan()).status).toBe(404);
    expect(logScanEventMock).not.toHaveBeenCalled();
  });

  it('returns 410 for a paused QR code', async () => {
    claimRefused({ ...BASE_QR, isPaused: true });

    const response = await scan();

    expect(response.status).toBe(410);
    expect(await response.text()).toContain('Paused');
    expect(logScanEventMock).not.toHaveBeenCalled();
  });

  it('returns 410 for an expired QR code', async () => {
    claimRefused({ ...BASE_QR, expiresAt: new Date(Date.now() - 1000 * 60 * 60) });

    const response = await scan();

    expect(response.status).toBe(410);
    expect(await response.text()).toContain('Expired');
  });

  it('returns 410 when the scan limit has been reached', async () => {
    claimRefused({ ...BASE_QR, scanLimit: 10, scanCount: 10 });

    const response = await scan();

    expect(response.status).toBe(410);
    expect(await response.text()).toContain('Scan Limit');
    expect(logScanEventMock).not.toHaveBeenCalled();
  });

  it('refuses a scan that lost a race for the last allowed scan', async () => {
    // Another scan took the last slot between our check and our claim: the
    // claim matches nothing, and the lookup now shows the limit reached.
    claimRefused({ ...BASE_QR, scanLimit: 5, scanCount: 5 });

    expect((await scan()).status).toBe(410);
  });
});

describe('GET /q/[shortCode] with a renamed link', () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    dbMock.update.mockReset();
    logScanEventMock.mockClear();
  });

  it('forwards an old link name to the code it now belongs to, and counts the scan on it', async () => {
    dbMock.update.mockReturnValueOnce(chainable([])); // no code has this name now
    dbMock.select.mockReturnValueOnce(chainable([{ qrCodeId: 'qr-1', pageId: null }])); // but it is an old name of qr-1
    claimSucceeds('https://example.com/new');

    const response = await scan('old-name');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://example.com/new');
    expect(logScanEventMock).toHaveBeenCalledWith('qr-1', expect.any(Request));
  });

  it('still explains why a renamed code is paused, instead of pretending it does not exist', async () => {
    dbMock.update.mockReturnValueOnce(chainable([]));
    dbMock.select.mockReturnValueOnce(chainable([{ qrCodeId: 'qr-1', pageId: null }]));
    dbMock.update.mockReturnValueOnce(chainable([])); // claim by id refused
    dbMock.select.mockReturnValueOnce(chainable([{ ...BASE_QR, isPaused: true }]));

    const response = await scan('old-name');

    expect(response.status).toBe(410);
    expect(await response.text()).toContain('Paused');
    expect(logScanEventMock).not.toHaveBeenCalled();
  });

  it('does not look for an old name when the current link works', async () => {
    claimSucceeds();

    await scan('current-name');

    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('treats capital letters in a link as the same link', async () => {
    claimSucceeds();

    expect((await scan('ANA-Memorial')).status).toBe(302);
  });
});

describe('GET /q/[shortCode] with an invalid destination', () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    dbMock.update.mockReset();
    logScanEventMock.mockClear();
  });

  it('returns 404 without logging when the target is not a valid URL', async () => {
    // "just some plain text" has no scheme, so the claim refuses it and every
    // other gate passes: the destination must be the problem.
    claimRefused({ ...BASE_QR, targetUrl: 'just some plain text' });

    const response = await scan();

    expect(response.status).toBe(404);
    expect(await response.text()).toContain('Destination Unavailable');
    expect(dbMock.update).toHaveBeenCalledTimes(1); // only the refused claim, no count
    expect(logScanEventMock).not.toHaveBeenCalled();
  });

  it('gives the scan back and 404s when a counted target turns out unusable', async () => {
    dbMock.update
      .mockReturnValueOnce(chainable([{ id: 'qr-1', targetUrl: 'http://' }])) // claim matched the scheme check
      .mockReturnValueOnce(chainable(undefined)); // compensating decrement

    const response = await scan();

    expect(response.status).toBe(404);
    expect(dbMock.update).toHaveBeenCalledTimes(2);
    expect(logScanEventMock).not.toHaveBeenCalled();
  });

  it('still redirects to non-http schemes like mailto: and tel:', async () => {
    claimSucceeds('mailto:a@b.com');
    const mail = await scan();
    expect(mail.status).toBe(302);
    expect(mail.headers.get('location')).toBe('mailto:a@b.com');

    claimSucceeds('tel:+15550102000');
    expect((await scan()).headers.get('location')).toBe('tel:+15550102000');
  });
});

describe('GET /q/[shortCode] for a video code', () => {
  const APP = 'https://memento-qr.vercel.app';
  const VIDEO = `${APP}/media/11111111-2222-3333-4444-555555555555/abcdefghij123.mp4`;
  const LEGACY = 'https://proj.supabase.co/storage/v1/object/public/uploads/11111111-2222-3333-4444-555555555555/abcdefghij123.mp4';

  function claimVideo(targetUrl: string, name = 'Ana memorial'): void {
    dbMock.update.mockReturnValueOnce(chainable([{ id: 'qr-1', targetUrl, qrType: 'video', name }]));
  }

  beforeEach(() => {
    dbMock.select.mockReset();
    dbMock.update.mockReset();
    logScanEventMock.mockClear();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', APP);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('plays the video on the same address instead of redirecting', async () => {
    claimVideo(VIDEO);

    const response = await scan();
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('<video controls playsinline preload="metadata"');
    expect(html).toContain(`src="${VIDEO}"`);
    expect(html).toContain('<title>Ana memorial</title>');
    expect(html).toContain('noindex');
    expect(html).toContain('name="viewport"');
    expect(html).not.toContain('<script');
  });

  it('is still a single query and counts one scan per page load', async () => {
    claimVideo(VIDEO);

    await scan();

    expect(dbMock.update).toHaveBeenCalledTimes(1);
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(logScanEventMock).toHaveBeenCalledTimes(1);
    expect(logScanEventMock).toHaveBeenCalledWith('qr-1', expect.any(Request));
  });

  it('serves an older storage address through our own /media/ address', async () => {
    claimVideo(LEGACY);

    const html = await (await scan()).text();

    expect(html).toContain(`src="${VIDEO}"`);
    expect(html).not.toContain('supabase.co');
  });

  it('escapes everything it prints', async () => {
    claimVideo(VIDEO, '"><script>alert(1)</script> & \'x\'');

    const html = await (await scan()).text();

    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; &#39;x&#39;');
  });

  it('locks the page down with a content security policy and does not cache it', async () => {
    claimVideo(VIDEO);

    const response = await scan();
    const csp = response.headers.get('content-security-policy')!;

    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("media-src 'self' https://proj.supabase.co");
    expect(csp).toContain("style-src 'unsafe-inline'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).not.toContain('script-src');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('answers Destination Unavailable, and gives the scan back, when the target is not one of our videos', async () => {
    for (const bad of ['https://evil.example/media/a/b.mp4', 'https://example.com/clip.mp4', `${APP}/media/a/b.html`, 'javascript:alert(1)']) {
      dbMock.update.mockReset();
      logScanEventMock.mockClear();
      dbMock.update
        .mockReturnValueOnce(chainable([{ id: 'qr-1', targetUrl: bad, qrType: 'video', name: 'x' }]))
        .mockReturnValueOnce(chainable(undefined)); // compensating decrement

      const response = await scan();

      expect(response.status).toBe(404);
      expect(await response.text()).toContain('Destination Unavailable');
      expect(dbMock.update).toHaveBeenCalledTimes(2);
      expect(logScanEventMock).not.toHaveBeenCalled();
    }
  });

  it('still refuses a paused video code with 410', async () => {
    dbMock.update.mockReturnValueOnce(chainable([]));
    dbMock.select.mockReturnValueOnce(chainable([]));
    dbMock.select.mockReturnValueOnce(chainable([{ ...BASE_QR, targetUrl: VIDEO, isPaused: true }]));

    const response = await scan();

    expect(response.status).toBe(410);
    expect(await response.text()).toContain('Paused');
    expect(logScanEventMock).not.toHaveBeenCalled();
  });

  it('still refuses an expired video code and one over its scan limit', async () => {
    claimRefusedVideo({ expiresAt: new Date(Date.now() - 1000) });
    expect((await scan()).status).toBe(410);

    claimRefusedVideo({ scanLimit: 3, scanCount: 3 });
    const limited = await scan();
    expect(limited.status).toBe(410);
    expect(await limited.text()).toContain('Scan Limit');
  });

  it('answers 404 (not an error) once the video file was deleted and the target cleared', async () => {
    claimRefusedVideo({ targetUrl: null });

    const response = await scan();

    expect(response.status).toBe(404);
    expect(await response.text()).toContain('Not Found');
  });

  it('plays the video for a code reached through an old link name, and counts the scan on it', async () => {
    dbMock.update.mockReturnValueOnce(chainable([])); // no code has this name now
    dbMock.select.mockReturnValueOnce(chainable([{ qrCodeId: 'qr-1', pageId: null }])); // old name of qr-1
    claimVideo(VIDEO);

    const response = await scan('old-name');

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(`src="${VIDEO}"`);
    expect(logScanEventMock).toHaveBeenCalledWith('qr-1', expect.any(Request));
  });

  function claimRefusedVideo(row: Record<string, unknown>): void {
    dbMock.update.mockReturnValueOnce(chainable([]));
    dbMock.select.mockReturnValueOnce(chainable([]));
    dbMock.select.mockReturnValueOnce(chainable([{ ...BASE_QR, targetUrl: VIDEO, ...row }]));
  }
});
