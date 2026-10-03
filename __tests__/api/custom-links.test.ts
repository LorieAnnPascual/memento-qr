import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { chainable, createDbMock } from '../helpers/db-mock';

const dbMock = createDbMock();
const getCurrentUserMock = vi.fn();

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: getCurrentUserMock }));

const USER = { authId: 'auth-1', email: 't@memento.local', profile: { id: 'profile-1' } };

/** Rows `isSlugAvailable` reads: first "is it anyone's current link?", then "is it an old link?". */
function availability({ current = [], alias = [] }: { current?: object[]; alias?: object[] } = {}): void {
  dbMock.select.mockReturnValueOnce(chainable(current)).mockReturnValueOnce(chainable(alias));
}

/** Makes `db.transaction(cb)` run `cb` against the same mock, and remembers what was written. */
function captureWrites() {
  const writes = { updates: [] as Record<string, unknown>[], inserts: [] as Record<string, unknown>[], deletes: 0 };
  dbMock.update.mockReturnValue({
    set: (values: Record<string, unknown>) => {
      writes.updates.push(values);
      return chainable([{ id: 'qr-1', name: 'Menu', ...values }]);
    },
  });
  dbMock.insert.mockReturnValue({
    values: (values: Record<string, unknown>) => {
      writes.inserts.push(values);
      return chainable([{ id: 'new-1', ...values }]);
    },
  });
  dbMock.delete.mockImplementation(() => {
    writes.deletes += 1;
    return chainable([]);
  });
  dbMock.transaction.mockImplementation(async (callback: (tx: typeof dbMock) => unknown) => callback(dbMock));
  return writes;
}

beforeEach(() => {
  for (const fn of Object.values(dbMock)) fn.mockReset();
  getCurrentUserMock.mockReset();
  getCurrentUserMock.mockResolvedValue(USER);
});

describe('POST /api/qr with a chosen link name', () => {
  const body = (extra: object) => ({
    name: 'Menu',
    qrType: 'url',
    payload: 'https://example.com/menu',
    styleConfig: {},
    isDynamic: true,
    ...extra,
  });
  const post = async (data: object) => {
    const { POST } = await import('@/app/api/qr/route');
    return POST(new NextRequest('http://localhost:3000/api/qr', { method: 'POST', body: JSON.stringify(data) }));
  };

  it('uses the chosen name as the link, and the code encodes that link', async () => {
    availability();
    const writes = captureWrites();

    const response = await post(body({ slug: 'Ana Memorial' }));

    expect(response.status).toBe(201);
    expect(writes.inserts[0]).toMatchObject({ shortCode: 'ana-memorial', targetUrl: 'https://example.com/menu' });
    expect(String(writes.inserts[0].payload)).toMatch(/\/q\/ana-memorial$/);
  });

  it('makes a random link when no name is given', async () => {
    const writes = captureWrites();

    await post(body({}));

    expect(writes.inserts[0].shortCode).toMatch(/^[a-z0-9]{6}$/);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('treats a blank name as no name', async () => {
    const writes = captureWrites();

    await post(body({ slug: '   ' }));

    expect(writes.inserts[0].shortCode).toMatch(/^[a-z0-9]{6}$/);
  });

  it('refuses a name somebody already uses (409)', async () => {
    availability({ current: [{ id: 'other-qr' }] });
    captureWrites();

    const response = await post(body({ slug: 'taken-name' }));

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('SLUG_TAKEN');
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it('refuses a name that is another code’s old link (409)', async () => {
    availability({ alias: [{ qrCodeId: 'other-qr', pageId: null }] });
    captureWrites();

    expect((await post(body({ slug: 'old-name' }))).status).toBe(409);
  });

  it('refuses a name that is not allowed (400)', async () => {
    captureWrites();

    const response = await post(body({ slug: 'ab' }));

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('INVALID_SLUG');
  });

  it('answers 409 when two people pick the same name at the same moment', async () => {
    availability();
    dbMock.insert.mockReturnValue({ values: () => ({ returning: () => Promise.reject({ code: '23505' }) }) });

    expect((await post(body({ slug: 'race-name' }))).status).toBe(409);
  });

  it('ignores a name on a static code, which has no link', async () => {
    const writes = captureWrites();

    await post(body({ isDynamic: false, slug: 'ignored' }));

    expect(writes.inserts[0].shortCode).toBeNull();
  });
});

describe('PUT /api/qr/[id] renaming the link', () => {
  const EXISTING = {
    id: 'qr-1',
    name: 'Menu',
    isDynamic: true,
    shortCode: 'old-name',
    targetUrl: 'https://example.com/menu',
    payload: 'https://app.test/q/old-name',
    deletedAt: null,
  };
  const params = Promise.resolve({ id: 'qr-1' });
  const put = async (data: object) => {
    const { PUT } = await import('@/app/api/qr/[id]/route');
    return PUT(new NextRequest('http://localhost:3000/api/qr/qr-1', { method: 'PUT', body: JSON.stringify(data) }), { params });
  };

  it('saves the new name and keeps the old one working, in one transaction', async () => {
    dbMock.select.mockReturnValueOnce(chainable([EXISTING]));
    availability();
    const writes = captureWrites();

    const response = await put({ isDynamic: true, slug: 'new-name', payload: 'https://example.com/menu' });

    expect(response.status).toBe(200);
    expect(dbMock.transaction).toHaveBeenCalledTimes(1);
    expect(writes.updates[0]).toMatchObject({ shortCode: 'new-name' });
    expect(String(writes.updates[0].payload)).toMatch(/\/q\/new-name$/);
    expect(writes.inserts[0]).toEqual({ kind: 'qr', code: 'old-name', qrCodeId: 'qr-1' });
  });

  it('does nothing special when the name is unchanged', async () => {
    dbMock.select.mockReturnValueOnce(chainable([EXISTING]));
    availability();
    const writes = captureWrites();

    await put({ isDynamic: true, slug: 'old-name', payload: 'https://example.com/menu' });

    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(writes.inserts).toHaveLength(0);
  });

  it('keeps the current link when no name is sent', async () => {
    dbMock.select.mockReturnValueOnce(chainable([EXISTING]));
    const writes = captureWrites();

    await put({ name: 'Menu (new)' });

    expect(writes.updates[0].shortCode).toBe('old-name'); // unchanged
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(writes.inserts).toHaveLength(0);
  });

  it('lets a code take back a name it used to have', async () => {
    dbMock.select.mockReturnValueOnce(chainable([EXISTING]));
    availability({ alias: [{ qrCodeId: 'qr-1', pageId: null }] }); // an old name of this very code
    const writes = captureWrites();

    const response = await put({ isDynamic: true, slug: 'earlier-name', payload: 'https://example.com/menu' });

    expect(response.status).toBe(200);
    expect(writes.deletes).toBe(1); // it stops being an alias of itself
  });

  it('refuses a name another code has (409) and changes nothing', async () => {
    dbMock.select.mockReturnValueOnce(chainable([EXISTING]));
    availability({ current: [{ id: 'another-qr' }] });
    const writes = captureWrites();

    const response = await put({ isDynamic: true, slug: 'someone-elses', payload: 'https://example.com/menu' });

    expect(response.status).toBe(409);
    expect(writes.updates).toHaveLength(0);
  });

  it('can give a code its first custom name when it becomes dynamic', async () => {
    dbMock.select.mockReturnValueOnce(chainable([{ ...EXISTING, isDynamic: false, shortCode: null, targetUrl: null, payload: 'https://example.com/menu' }]));
    availability();
    const writes = captureWrites();

    await put({ isDynamic: true, slug: 'first-name', payload: 'https://example.com/menu' });

    expect(writes.updates[0]).toMatchObject({ shortCode: 'first-name' });
    expect(dbMock.transaction).not.toHaveBeenCalled(); // nothing to keep working: it had no link before
  });
});

describe('page link names', () => {
  const PAGE = { id: 'page-1', name: 'Ana', isSystem: false, isPublished: false, shortCode: null as string | null, publishedAt: null, expiresAt: null };
  const params = Promise.resolve({ id: 'page-1' });

  const publish = async (data: object) => {
    const { POST } = await import('@/app/api/pages/[id]/publish/route');
    return POST(new NextRequest('http://localhost:3000/api/pages/page-1/publish', { method: 'POST', body: JSON.stringify(data) }), { params });
  };
  const rename = async (data: object) => {
    const { PUT } = await import('@/app/api/pages/[id]/slug/route');
    return PUT(new NextRequest('http://localhost:3000/api/pages/page-1/slug', { method: 'PUT', body: JSON.stringify(data) }), { params });
  };

  it('publishes at a chosen link', async () => {
    dbMock.select.mockReturnValueOnce(chainable([PAGE]));
    availability();
    const writes = captureWrites();

    const response = await publish({ slug: 'Ana Memorial' });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.shortCode).toBe('ana-memorial');
    expect(body.url).toMatch(/\/p\/ana-memorial$/);
    expect(writes.updates[0]).toMatchObject({ isPublished: true, shortCode: 'ana-memorial' });
  });

  it('keeps the existing link when publishing again without a name', async () => {
    dbMock.select.mockReturnValueOnce(chainable([{ ...PAGE, shortCode: 'kept1' }]));
    const writes = captureWrites();

    const body = await (await publish({})).json();

    expect(body.shortCode).toBe('kept1');
    expect(writes.updates[0]).toMatchObject({ shortCode: 'kept1' });
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it('refuses a name another page has (409)', async () => {
    dbMock.select.mockReturnValueOnce(chainable([PAGE]));
    availability({ current: [{ id: 'other-page' }] });
    captureWrites();

    expect((await publish({ slug: 'taken-name' })).status).toBe(409);
  });

  it('renames a page’s link and keeps the old one working', async () => {
    dbMock.select.mockReturnValueOnce(chainable([{ ...PAGE, shortCode: 'old-page' }]));
    availability();
    const writes = captureWrites();

    const response = await rename({ slug: 'new-page' });

    expect(response.status).toBe(200);
    expect((await response.json()).url).toMatch(/\/p\/new-page$/);
    expect(dbMock.transaction).toHaveBeenCalledTimes(1);
    expect(writes.inserts[0]).toEqual({ kind: 'page', code: 'old-page', pageId: 'page-1' });
  });

  it('does nothing when the new name is the current one', async () => {
    dbMock.select.mockReturnValueOnce(chainable([{ ...PAGE, shortCode: 'same-name' }]));
    availability();
    const writes = captureWrites();

    expect((await rename({ slug: 'same-name' })).status).toBe(200);
    expect(writes.updates).toHaveLength(0);
  });

  it('needs a name, and a valid one', async () => {
    dbMock.select.mockReturnValue(chainable([PAGE]));
    captureWrites();

    expect((await rename({ slug: '' })).status).toBe(400);
    expect((await rename({ slug: '!!!' })).status).toBe(400);
    expect((await rename({})).status).toBe(400);
  });

  it('needs a login', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    expect((await rename({ slug: 'any-name' })).status).toBe(401);
  });

  it('never renames a built-in template', async () => {
    dbMock.select.mockReturnValueOnce(chainable([{ ...PAGE, isSystem: true }]));

    expect((await rename({ slug: 'any-name' })).status).toBe(403);
  });
});

describe('GET /api/slugs/check', () => {
  const check = async (query: string) => {
    const { GET } = await import('@/app/api/slugs/check/route');
    return GET(new Request(`http://localhost:3000/api/slugs/check?${query}`));
  };

  it('needs a login', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    expect((await check('kind=qr&slug=abc')).status).toBe(401);
  });

  it('says a free name is available, and shows how it was cleaned up', async () => {
    availability();

    const body = await (await check('kind=qr&slug=Ana%20Memorial')).json();

    expect(body).toMatchObject({ slug: 'ana-memorial', valid: true, available: true });
  });

  it('says a used name is taken', async () => {
    availability({ current: [{ id: 'other' }] });

    const body = await (await check('kind=page&slug=taken-name')).json();

    expect(body).toMatchObject({ valid: true, available: false, error: expect.stringMatching(/taken/) });
  });

  it('explains a name that is not allowed without touching the database', async () => {
    const body = await (await check('kind=qr&slug=ab')).json();

    expect(body).toMatchObject({ valid: false, available: false });
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('lets the item being renamed keep its own name', async () => {
    availability({ current: [{ id: '11111111-2222-4333-8444-555555555555' }] });

    const body = await (await check('kind=qr&slug=my-own-name&excludeId=11111111-2222-4333-8444-555555555555')).json();

    expect(body.available).toBe(true);
  });

  it('rejects a bad request', async () => {
    expect((await check('kind=other&slug=abc')).status).toBe(400);
    expect((await check('kind=qr&slug=abc&excludeId=not-a-uuid')).status).toBe(400);
  });
});
