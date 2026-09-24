import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

import { chainable, createDbMock } from '../helpers/db-mock';

const dbMock = createDbMock();
const getCurrentUserMock = vi.fn();
const logActivityMock = vi.fn();
const searchMock = vi.fn();

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock('@/lib/activity/log-activity', () => ({ logActivity: logActivityMock }));
vi.mock('@/lib/search/search', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/search/search')>();
  return { ...original, searchWorkspace: searchMock };
});

const USER = { authId: 'auth-1', email: 'me@memento.local', profile: { id: 'profile-1' } };
const TEAMMATE = '22222222-2222-4222-8222-222222222222';

function put(body: unknown): Request {
  return new Request('http://localhost:3000/api/workflow/qr/qr-1', { method: 'PUT', body: JSON.stringify(body) });
}

function ctx(kind: string, id = 'qr-1'): { params: Promise<{ kind: string; id: string }> } {
  return { params: Promise.resolve({ kind, id }) };
}

beforeEach(() => {
  for (const fn of Object.values(dbMock)) fn.mockReset();
  for (const fn of [getCurrentUserMock, logActivityMock, searchMock]) fn.mockReset();
  getCurrentUserMock.mockResolvedValue(USER);
});

describe('PUT /api/workflow/[kind]/[id]', () => {
  async function call(kind: string, body: unknown, id?: string): Promise<Response> {
    const { PUT } = await import('@/app/api/workflow/[kind]/[id]/route');
    return PUT(put(body), ctx(kind, id));
  }

  /** select() answers in call order: first the assignee lookup (when there is one), then the item. */
  function stub(rows: unknown[][], updated: Record<string, unknown> | null = { name: 'Menu' }): { captured: () => Record<string, unknown> } {
    for (const result of rows) dbMock.select.mockReturnValueOnce(chainable(result));
    let captured: Record<string, unknown> = {};
    dbMock.update.mockReturnValue({
      set: (values: Record<string, unknown>) => {
        captured = values;
        return chainable(updated ? [{ ...updated, ...values }] : []);
      },
    });
    return { captured: () => captured };
  }

  it('requires login', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    expect((await call('qr', {})).status).toBe(401);
  });

  it('rejects an unknown item type', async () => {
    expect((await call('folder', {})).status).toBe(400);
  });

  it('rejects invalid details', async () => {
    const response = await call('qr', { assignedTo: 'not-an-id' });

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('VALIDATION_ERROR');
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it('404s when the teammate does not exist', async () => {
    stub([[]]);

    const response = await call('qr', { assignedTo: TEAMMATE });

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe('USER_NOT_FOUND');
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it('404s for a QR code that does not exist or was deleted', async () => {
    stub([[]]);
    expect((await call('qr', { nextAction: 'x' })).status).toBe(404);

    stub([[{ id: 'qr-1', name: 'Menu', deletedAt: new Date() }]]);
    expect((await call('qr', { nextAction: 'x' })).status).toBe(404);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it('refuses to change a built-in page template', async () => {
    stub([[{ id: 'p1', name: 'Blank', isSystem: true }]]);

    expect((await call('page', { nextAction: 'x' }, 'p1')).status).toBe(404);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it('hands a QR code to a teammate and records it in the activity log', async () => {
    const state = stub([[{ fullName: 'Maria Santos', email: 'maria@x.co' }], [{ id: 'qr-1', name: 'Menu', deletedAt: null }]]);

    const response = await call('qr', { assignedTo: TEAMMATE, nextAction: 'Send to printer', notes: 'Use the blue one' });

    expect(response.status).toBe(200);
    expect(state.captured()).toMatchObject({
      assignedTo: TEAMMATE,
      nextAction: 'Send to printer',
      notes: 'Use the blue one',
      updatedBy: 'profile-1',
    });
    expect(logActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'qr.handoff',
        entityType: 'qr',
        entityId: 'qr-1',
        details: { assignedToName: 'Maria Santos', unassigned: false },
      }),
    );
    expect(await response.json()).toMatchObject({ assignedTo: TEAMMATE, nextAction: 'Send to printer' });
  });

  it('unassigns with null and clears empty text fields', async () => {
    const state = stub([[{ id: 'qr-1', name: 'Menu', deletedAt: null }]]);

    await call('qr', { assignedTo: null, nextAction: '', notes: null });

    expect(state.captured()).toMatchObject({ assignedTo: null, nextAction: null, notes: null });
    expect(logActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({ details: { assignedToName: null, unassigned: true } }),
    );
  });

  it('only changes the fields that were sent', async () => {
    const state = stub([[{ id: 'qr-1', name: 'Menu', deletedAt: null }]]);

    await call('qr', { nextAction: 'Check it' });

    expect(state.captured()).not.toHaveProperty('assignedTo');
    expect(state.captured()).not.toHaveProperty('checklist');
    expect(state.captured().nextAction).toBe('Check it');
  });

  it('saves a checklist, folding repeated saves in the activity log', async () => {
    const checklist = [{ id: 'a', label: 'Verify the QR destination', done: true }];
    const state = stub([[{ id: 'qr-1', name: 'Menu', deletedAt: null }]]);

    await call('qr', { checklist });

    expect(state.captured().checklist).toEqual(checklist);
    expect(logActivityMock).toHaveBeenCalledWith(expect.objectContaining({ collapseWithinMs: 600_000 }));
  });

  it('works for pages too', async () => {
    stub([[{ id: 'p1', name: 'Promo', isSystem: false }]], { name: 'Promo' });

    const response = await call('page', { nextAction: 'Proofread' }, 'p1');

    expect(response.status).toBe(200);
    expect(logActivityMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'page.handoff', entityType: 'page' }));
  });
});

describe('GET /api/qr/[id]/check', () => {
  const params = Promise.resolve({ id: 'qr-1' });
  const QR = {
    id: 'qr-1',
    isDynamic: true,
    isPaused: false,
    expiresAt: null,
    scanLimit: null,
    scanCount: 0,
    targetUrl: 'https://example.com/menu',
    payload: 'https://memento-qr.vercel.app/q/abc234',
  };

  afterEach(() => vi.unstubAllGlobals());

  async function call(): Promise<Response> {
    const { GET } = await import('@/app/api/qr/[id]/check/route');
    return GET(new Request('http://localhost:3000/api/qr/qr-1/check'), { params });
  }

  it('requires login', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    expect((await call()).status).toBe(401);
  });

  it('404s for a code that does not exist', async () => {
    dbMock.select.mockReturnValue(chainable([]));

    expect((await call()).status).toBe(404);
  });

  it("reports the code's status and whether the destination answers, without counting a scan", async () => {
    dbMock.select.mockReturnValue(chainable([QR]));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const body = await (await call()).json();

    expect(body.status).toMatchObject({ health: 'ok', label: 'Working', destination: 'https://example.com/menu' });
    expect(body.destination.result).toBe('reachable');
    expect(dbMock.update).not.toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it('shows a paused code as a problem', async () => {
    dbMock.select.mockReturnValue(chainable([{ ...QR, isPaused: true }]));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    expect((await (await call()).json()).status).toMatchObject({ health: 'problem', label: 'Paused' });
  });

  it('never fetches an internal address', async () => {
    dbMock.select.mockReturnValue(chainable([{ ...QR, targetUrl: 'http://169.254.169.254/latest' }]));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const body = await (await call()).json();

    expect(body.destination.result).toBe('unchecked');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/search', () => {
  async function call(query: string): Promise<Response> {
    const { GET } = await import('@/app/api/search/route');
    return GET(new NextRequest(`http://localhost:3000/api/search?q=${encodeURIComponent(query)}`));
  }

  it('requires login', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    expect((await call('menu')).status).toBe(401);
  });

  it('asks for at least 2 characters', async () => {
    const response = await call('a');

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('QUERY_TOO_SHORT');
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('returns the results for a real query', async () => {
    searchMock.mockResolvedValue({ query: 'menu', qrCodes: [{ id: 'q1', name: 'Menu' }], pages: [], folders: [], templates: [] });

    const response = await call('menu');

    expect(response.status).toBe(200);
    expect((await response.json()).qrCodes[0].name).toBe('Menu');
    expect(searchMock).toHaveBeenCalledWith('menu');
  });
});

describe('GET /api/qr with the assigned filter', () => {
  async function list(query: string): Promise<Response> {
    dbMock.select.mockReturnValue(chainable([{ total: 0 }]));
    const { GET } = await import('@/app/api/qr/route');
    return GET(new Request(`http://localhost:3000/api/qr${query}`));
  }

  it.each(['?assigned=me', '?assigned=none', `?assigned=${TEAMMATE}`, '?assigned=garbage', ''])('accepts %s', async (query) => {
    expect((await list(query)).status).toBe(200);
  });
});
