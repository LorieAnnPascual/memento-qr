import { afterEach, describe, it, expect, vi } from 'vitest';

import { checkDestination, isPublicWebUrl } from '@/lib/qr/check-destination';
import { getQrStatus, type QrStatusInput } from '@/lib/qr/status';

const NOW = new Date('2026-06-01T12:00:00Z');
const DAY = 86_400_000;

function dynamic(over: Partial<QrStatusInput> = {}): QrStatusInput {
  return {
    isDynamic: true,
    isPaused: false,
    expiresAt: null,
    scanLimit: null,
    scanCount: 0,
    targetUrl: 'https://example.com/menu',
    payload: 'https://memento-qr.vercel.app/q/abc234',
    ...over,
  };
}

describe('getQrStatus', () => {
  it('treats a static code as always working', () => {
    const status = getQrStatus({ ...dynamic(), isDynamic: false, targetUrl: null, payload: 'WIFI:S:x;;' }, NOW);

    expect(status.health).toBe('ok');
    expect(status.destination).toBe('WIFI:S:x;;');
  });

  it('reports a healthy dynamic code as working, with its destination', () => {
    const status = getQrStatus(dynamic(), NOW);

    expect(status).toMatchObject({ health: 'ok', label: 'Working', destination: 'https://example.com/menu' });
  });

  it('flags a dynamic code with no destination', () => {
    expect(getQrStatus(dynamic({ targetUrl: null }), NOW)).toMatchObject({ health: 'problem', label: 'No destination' });
  });

  it('flags a paused code', () => {
    expect(getQrStatus(dynamic({ isPaused: true }), NOW)).toMatchObject({ health: 'problem', label: 'Paused' });
  });

  it('flags an expired code', () => {
    const status = getQrStatus(dynamic({ expiresAt: new Date(NOW.getTime() - DAY) }), NOW);

    expect(status).toMatchObject({ health: 'problem', label: 'Expired' });
  });

  it('accepts an expiry given as an ISO string', () => {
    expect(getQrStatus(dynamic({ expiresAt: '2026-05-01T00:00:00Z' }), NOW).label).toBe('Expired');
  });

  it('flags a code that reached its scan limit', () => {
    const status = getQrStatus(dynamic({ scanLimit: 5, scanCount: 5 }), NOW);

    expect(status).toMatchObject({ health: 'problem', label: 'Scan limit reached' });
  });

  it('checks the problems in priority order: paused before expired', () => {
    expect(getQrStatus(dynamic({ isPaused: true, expiresAt: new Date(NOW.getTime() - DAY) }), NOW).label).toBe('Paused');
  });

  it('warns when expiry is within a week', () => {
    const status = getQrStatus(dynamic({ expiresAt: new Date(NOW.getTime() + 3 * DAY) }), NOW);

    expect(status).toMatchObject({ health: 'warning', label: 'Working, expires soon' });
    expect(status.detail).toContain('3 days');
  });

  it('does not warn about an expiry that is weeks away', () => {
    expect(getQrStatus(dynamic({ expiresAt: new Date(NOW.getTime() + 30 * DAY) }), NOW).health).toBe('ok');
  });

  it('warns when the scan limit is almost used up', () => {
    const status = getQrStatus(dynamic({ scanLimit: 100, scanCount: 95 }), NOW);

    expect(status).toMatchObject({ health: 'warning', label: 'Working, nearly at its limit' });
  });

  it('does not warn when plenty of scans remain', () => {
    expect(getQrStatus(dynamic({ scanLimit: 100, scanCount: 10 }), NOW).health).toBe('ok');
  });
});

describe('isPublicWebUrl', () => {
  it('accepts ordinary http(s) addresses', () => {
    expect(isPublicWebUrl('https://example.com/a?b=1')?.hostname).toBe('example.com');
    expect(isPublicWebUrl('http://example.org')).not.toBeNull();
  });

  it.each([
    'tel:+639171234567',
    'mailto:a@b.co',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'not a url',
    '',
    'http://localhost:3000',
    'http://127.0.0.1/admin',
    'http://10.0.0.5',
    'http://192.168.1.1',
    'http://172.16.0.1',
    'http://169.254.169.254/latest/meta-data',
    'http://0.0.0.0',
    'http://[::1]/',
    'http://printer.local',
    'http://db.internal',
  ])('refuses %s', (value) => {
    expect(isPublicWebUrl(value)).toBeNull();
  });

  it('does not treat public addresses that merely look similar as private', () => {
    expect(isPublicWebUrl('http://172.32.0.1')).not.toBeNull();
    expect(isPublicWebUrl('http://110.5.5.5')).not.toBeNull();
  });
});

describe('checkDestination', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(...responses: Array<Partial<Response> | Error>): ReturnType<typeof vi.fn> {
    const fn = vi.fn();
    for (const response of responses) {
      if (response instanceof Error) fn.mockRejectedValueOnce(response);
      else fn.mockResolvedValueOnce(response);
    }
    vi.stubGlobal('fetch', fn);
    return fn;
  }

  it('does not fetch non-web or private addresses', async () => {
    const fn = stubFetch();

    expect((await checkDestination('tel:+639171234567')).result).toBe('unchecked');
    expect((await checkDestination('http://localhost:3000')).result).toBe('unchecked');
    expect(fn).not.toHaveBeenCalled();
  });

  it('reports a reachable destination', async () => {
    stubFetch({ ok: true, status: 200 });

    expect(await checkDestination('https://example.com')).toMatchObject({ result: 'reachable', httpStatus: 200 });
  });

  it('counts a redirect as answering, and never follows it', async () => {
    const fn = stubFetch({ ok: false, status: 301 });

    expect((await checkDestination('https://example.com')).result).toBe('reachable');
    expect(fn.mock.calls[0][1]).toMatchObject({ redirect: 'manual', method: 'HEAD' });
  });

  it('retries with GET when a site refuses HEAD', async () => {
    const fn = stubFetch({ ok: false, status: 405 }, { ok: true, status: 200 });

    expect((await checkDestination('https://example.com')).result).toBe('reachable');
    expect(fn.mock.calls[1][1]).toMatchObject({ method: 'GET' });
  });

  it('reports a page that returns an error', async () => {
    stubFetch({ ok: false, status: 404 });

    const check = await checkDestination('https://example.com/gone');

    expect(check).toMatchObject({ result: 'unreachable', httpStatus: 404 });
    expect(check.message).toContain('404');
  });

  it('reports a site that does not answer', async () => {
    stubFetch(new Error('timeout'));

    expect((await checkDestination('https://example.com')).result).toBe('unreachable');
  });
});
