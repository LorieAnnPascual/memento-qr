import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  dbMock.update.mockReturnValueOnce(chainable([{ id: BASE_QR.id, targetUrl }]));
}

/** The claim matches nothing; the route then looks the code up to explain why. */
function claimRefused(row: Record<string, unknown> | null): void {
  dbMock.update.mockReturnValueOnce(chainable([]));
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
