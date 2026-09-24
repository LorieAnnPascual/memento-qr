import { describe, it, expect, vi, beforeEach } from 'vitest';

import { chainable, createDbMock } from '../helpers/db-mock';

const dbMock = createDbMock();
const getCurrentUserMock = vi.fn();
const logActivityMock = vi.fn();
const checkDestinationMock = vi.fn();

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock('@/lib/activity/log-activity', () => ({ logActivity: logActivityMock }));
vi.mock('@/lib/qr/check-destination', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/qr/check-destination')>();
  return { ...original, checkDestination: checkDestinationMock };
});

const USER = { authId: 'a', email: 'me@x.co', profile: { id: 'profile-1' } };
const ctx = { params: Promise.resolve({ id: 'qr-1' }) };
const UUID = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  for (const fn of Object.values(dbMock)) fn.mockReset();
  for (const fn of [getCurrentUserMock, logActivityMock, checkDestinationMock]) fn.mockReset();
  getCurrentUserMock.mockResolvedValue(USER);
});

describe('GET /api/qr/[id]/history', () => {
  async function call(): Promise<Response> {
    const { GET } = await import('@/app/api/qr/[id]/history/route');
    return GET(new Request('http://localhost:3000/api/qr/qr-1/history'), ctx);
  }

  it('requires login', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it('404s for a code that does not exist', async () => {
    dbMock.select.mockReturnValue(chainable([]));
    expect((await call()).status).toBe(404);
  });

  it('lists entries newest first with who changed them, and what is current', async () => {
    dbMock.select
      .mockReturnValueOnce(chainable([{ id: 'qr-1', isDynamic: true, targetUrl: 'https://new.example' }]))
      .mockReturnValueOnce(
        chainable([
          { id: 'h2', destination: 'https://new.example', previousDestination: 'https://old.example', restoredFromId: null, createdAt: new Date(), fullName: 'Maria Santos', email: 'm@x.co' },
          { id: 'h1', destination: 'https://old.example', previousDestination: null, restoredFromId: null, createdAt: new Date(), fullName: null, email: 'yayen@x.co' },
          { id: 'h3', destination: 'https://x', previousDestination: null, restoredFromId: 'h1', createdAt: new Date(), fullName: null, email: null },
        ]),
      );

    const body = await (await call()).json();

    expect(body.current).toBe('https://new.example');
    expect(body.entries.map((e: { changedBy: string | null }) => e.changedBy)).toEqual(['Maria Santos', 'yayen', null]);
    expect(body.entries[2].isRestore).toBe(true);
  });
});

describe('POST /api/qr/[id]/restore', () => {
  async function call(body: unknown): Promise<Response> {
    const { POST } = await import('@/app/api/qr/[id]/restore/route');
    return POST(new Request('http://localhost:3000/api/qr/qr-1/restore', { method: 'POST', body: JSON.stringify(body) }), ctx);
  }

  const QR = { id: 'qr-1', name: 'Menu', isDynamic: true, targetUrl: 'https://new.example' };
  const ENTRY = { id: UUID, qrCodeId: 'qr-1', destination: 'https://old.example' };

  function stubUpdate(): { captured: () => Record<string, unknown> } {
    let captured: Record<string, unknown> = {};
    dbMock.update.mockReturnValue({
      set: (values: Record<string, unknown>) => {
        captured = values;
        return chainable([{ ...QR, ...values }]);
      },
    });
    return { captured: () => captured };
  }

  it('requires login', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await call({ historyId: UUID })).status).toBe(401);
  });

  it('rejects a bad request', async () => {
    expect((await call({ historyId: 'nope' })).status).toBe(400);
    expect((await call(null)).status).toBe(400);
  });

  it('404s for a missing code or a history entry that is not this code\'s', async () => {
    dbMock.select.mockReturnValueOnce(chainable([]));
    expect((await call({ historyId: UUID })).status).toBe(404);

    dbMock.select.mockReturnValueOnce(chainable([QR])).mockReturnValueOnce(chainable([]));
    const response = await call({ historyId: UUID });
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe('HISTORY_NOT_FOUND');
  });

  it('refuses a static code', async () => {
    dbMock.select.mockReturnValueOnce(chainable([{ ...QR, isDynamic: false }]));
    expect((await call({ historyId: UUID })).status).toBe(409);
  });

  it('refuses to "restore" the destination that is already current', async () => {
    dbMock.select.mockReturnValueOnce(chainable([QR])).mockReturnValueOnce(chainable([{ ...ENTRY, destination: QR.targetUrl }]));
    const response = await call({ historyId: UUID });

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('ALREADY_CURRENT');
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it('restores the destination, clears the stale health result, and records who did it', async () => {
    dbMock.select.mockReturnValueOnce(chainable([QR])).mockReturnValueOnce(chainable([ENTRY]));
    dbMock.insert.mockReturnValue(chainable([]));
    const state = stubUpdate();

    const response = await call({ historyId: UUID });

    expect(response.status).toBe(200);
    expect(state.captured()).toMatchObject({
      targetUrl: 'https://old.example',
      updatedBy: 'profile-1',
      healthStatus: null,
      healthMessage: null,
      healthCheckedAt: null,
    });
    // The restore is itself written into the history and the activity log.
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    expect(logActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'qr.destination_restored', details: { from: 'https://new.example', to: 'https://old.example' } }),
    );
  });
});

describe('link monitoring', () => {
  const dynamic = (over: Record<string, unknown> = {}) => ({
    id: 'q1',
    name: 'Menu',
    isDynamic: true,
    isPaused: false,
    expiresAt: null,
    scanLimit: null,
    scanCount: 0,
    targetUrl: 'https://example.com',
    payload: 'https://app/q/abc',
    healthStatus: null,
    ...over,
  });

  async function run(rows: unknown[]) {
    dbMock.select.mockReturnValueOnce(chainable(rows));
    dbMock.update.mockReturnValue({ set: () => chainable([]) });
    const { runLinkChecks } = await import('@/lib/monitoring/link-health');
    return runLinkChecks();
  }

  it('checks every code and counts the results', async () => {
    checkDestinationMock.mockResolvedValue({ result: 'reachable', message: 'ok' });

    const summary = await run([dynamic(), dynamic({ id: 'q2', isPaused: true })]);

    expect(summary).toMatchObject({ checked: 2, ok: 1, broken: 1, newlyBroken: 1 });
  });

  it('announces a code that newly broke, once, as a system entry', async () => {
    checkDestinationMock.mockResolvedValue({ result: 'unreachable', message: 'HTTP 404' });

    await run([dynamic({ healthStatus: 'ok' })]);

    expect(logActivityMock).toHaveBeenCalledTimes(1);
    expect(logActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, action: 'qr.health_changed', details: { status: 'broken', message: 'HTTP 404' } }),
    );
  });

  it('does not re-announce a code that was already broken', async () => {
    checkDestinationMock.mockResolvedValue({ result: 'unreachable', message: 'HTTP 404' });

    const summary = await run([dynamic({ healthStatus: 'broken' })]);

    expect(summary.newlyBroken).toBe(0);
    expect(logActivityMock).not.toHaveBeenCalled();
  });

  it('announces recovery', async () => {
    checkDestinationMock.mockResolvedValue({ result: 'reachable', message: 'ok' });

    await run([dynamic({ healthStatus: 'broken' })]);

    expect(logActivityMock).toHaveBeenCalledWith(expect.objectContaining({ details: { status: 'ok' } }));
  });

  it('keeps going when one code fails to check', async () => {
    checkDestinationMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ result: 'reachable', message: 'ok' });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const summary = await run([dynamic(), dynamic({ id: 'q2' })]);

    expect(summary.checked).toBe(1);
    spy.mockRestore();
  });

  it('handles having nothing to check', async () => {
    expect(await run([])).toMatchObject({ checked: 0 });
  });
});

describe('GET /api/cron/link-check', () => {
  async function call(header?: string): Promise<Response> {
    const { GET } = await import('@/app/api/cron/link-check/route');
    return GET(new Request('http://localhost:3000/api/cron/link-check', { headers: header ? { authorization: header } : {} }));
  }

  it('is closed when no secret is configured', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await call('Bearer x')).status).toBe(503);
    vi.unstubAllEnvs();
  });

  it('refuses a missing or wrong secret', async () => {
    vi.stubEnv('CRON_SECRET', 'right-secret');
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong-secret')).status).toBe(401);
    expect((await call('right-secret')).status).toBe(401);
    vi.unstubAllEnvs();
  });

  it('runs the checks for the right secret', async () => {
    vi.stubEnv('CRON_SECRET', 'right-secret');
    dbMock.select.mockReturnValue(chainable([]));

    const response = await call('Bearer right-secret');

    expect(response.status).toBe(200);
    expect((await response.json()).summary.checked).toBe(0);
    vi.unstubAllEnvs();
  });
});
