import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { chainable, createDbMock } from '../helpers/db-mock';

const dbMock = createDbMock();
const getCurrentUserMock = vi.fn();

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: getCurrentUserMock }));

const USER = { authId: 'auth-1', email: 't@memento.local', profile: { id: 'profile-1' } };
const params = Promise.resolve({ id: 'page-1' });
const HOUR = 60 * 60 * 1000;

const OWN_PAGE = {
  id: 'page-1',
  userId: 'profile-1',
  isSystem: false,
  isPublished: false,
  shortCode: null as string | null,
  publishedAt: null as Date | null,
  expiresAt: null as Date | null,
};

function call(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/pages/page-1/publish', {
    method,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

function captureUpdate() {
  const captured: { set: Record<string, unknown> } = { set: {} };
  dbMock.update.mockReturnValue({
    set: (v: Record<string, unknown>) => {
      captured.set = v;
      return chainable([]);
    },
  });
  return captured;
}

describe('POST /api/pages/[id]/publish', () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    dbMock.update.mockReset();
    getCurrentUserMock.mockReset();
  });

  it('returns 401 without authentication', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { POST } = await import('@/app/api/pages/[id]/publish/route');
    expect((await POST(call('POST', {}), { params })).status).toBe(401);
  });

  it('returns 404 for a page that does not exist', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    dbMock.select.mockReturnValue(chainable([]));
    const { POST } = await import('@/app/api/pages/[id]/publish/route');
    expect((await POST(call('POST', {}), { params })).status).toBe(404);
  });

  it('returns 403 for a system template', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    const { POST } = await import('@/app/api/pages/[id]/publish/route');

    dbMock.select.mockReturnValue(chainable([{ ...OWN_PAGE, isSystem: true, userId: null }]));
    expect((await POST(call('POST', {}), { params })).status).toBe(403);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it('publishes with a fresh short code and no expiry', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    dbMock.select.mockReturnValue(chainable([OWN_PAGE]));
    const captured = captureUpdate();
    const { POST } = await import('@/app/api/pages/[id]/publish/route');

    const response = await POST(call('POST', {}), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.published).toBe(true);
    expect(body.shortCode).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/);
    expect(body.url).toBe(`http://localhost:3000/p/${body.shortCode}`);
    expect(body.expiresAt).toBeNull();
    expect(captured.set).toMatchObject({ isPublished: true, shortCode: body.shortCode, expiresAt: null });
  });

  it('reuses the existing short code when re-publishing', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    dbMock.select.mockReturnValue(chainable([{ ...OWN_PAGE, shortCode: 'keep12', publishedAt: new Date() }]));
    captureUpdate();
    const { POST } = await import('@/app/api/pages/[id]/publish/route');

    const body = await (await POST(call('POST', {}), { params })).json();
    expect(body.shortCode).toBe('keep12');
  });

  it('sets a future expiration', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    dbMock.select.mockReturnValue(chainable([OWN_PAGE]));
    const captured = captureUpdate();
    const { POST } = await import('@/app/api/pages/[id]/publish/route');

    const expiresAt = new Date(Date.now() + HOUR).toISOString();
    const body = await (await POST(call('POST', { expiresAt }), { params })).json();

    expect(body.expiresAt).toBe(expiresAt);
    expect(captured.set.expiresAt).toEqual(new Date(expiresAt));
  });

  it('rejects an expiration in the past', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    dbMock.select.mockReturnValue(chainable([OWN_PAGE]));
    const { POST } = await import('@/app/api/pages/[id]/publish/route');

    const response = await POST(call('POST', { expiresAt: new Date(Date.now() - HOUR).toISOString() }), { params });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('INVALID_EXPIRY');
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it('keeps a still-valid expiry when none is sent, and drops a stale one', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    const { POST } = await import('@/app/api/pages/[id]/publish/route');

    const future = new Date(Date.now() + HOUR);
    dbMock.select.mockReturnValue(chainable([{ ...OWN_PAGE, expiresAt: future }]));
    let captured = captureUpdate();
    await POST(call('POST', {}), { params });
    expect(captured.set.expiresAt).toEqual(future);

    dbMock.select.mockReturnValue(chainable([{ ...OWN_PAGE, expiresAt: new Date(Date.now() - HOUR) }]));
    captured = captureUpdate();
    await POST(call('POST', {}), { params });
    expect(captured.set.expiresAt).toBeNull();
  });

  it('removes the expiry when null is sent', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    dbMock.select.mockReturnValue(chainable([{ ...OWN_PAGE, expiresAt: new Date(Date.now() + HOUR) }]));
    const captured = captureUpdate();
    const { POST } = await import('@/app/api/pages/[id]/publish/route');

    await POST(call('POST', { expiresAt: null }), { params });
    expect(captured.set.expiresAt).toBeNull();
  });
});

describe('DELETE /api/pages/[id]/publish', () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    dbMock.update.mockReset();
    getCurrentUserMock.mockReset();
  });

  it('returns 401 without authentication', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/pages/[id]/publish/route');
    expect((await DELETE(call('DELETE'), { params })).status).toBe(401);
  });

  it('returns 404 for a page that does not exist', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    dbMock.select.mockReturnValue(chainable([]));
    const { DELETE } = await import('@/app/api/pages/[id]/publish/route');
    expect((await DELETE(call('DELETE'), { params })).status).toBe(404);
  });

  it('unpublishes but preserves the short code', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    dbMock.select.mockReturnValue(chainable([{ ...OWN_PAGE, isPublished: true, shortCode: 'keep12' }]));
    const captured = captureUpdate();
    const { DELETE } = await import('@/app/api/pages/[id]/publish/route');

    const response = await DELETE(call('DELETE'), { params });
    expect((await response.json()).published).toBe(false);
    expect(captured.set.isPublished).toBe(false);
    expect(captured.set).not.toHaveProperty('shortCode');
  });
});

describe('PUT /api/pages/[id]/expiry', () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    dbMock.update.mockReset();
    getCurrentUserMock.mockReset();
  });

  const put = (body: unknown) =>
    new NextRequest('http://localhost:3000/api/pages/page-1/expiry', { method: 'PUT', body: JSON.stringify(body) });

  it('returns 401 without authentication', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { PUT } = await import('@/app/api/pages/[id]/expiry/route');
    expect((await PUT(put({ expiresAt: null }), { params })).status).toBe(401);
  });

  it('returns 404 for a page that does not exist', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    dbMock.select.mockReturnValue(chainable([]));
    const { PUT } = await import('@/app/api/pages/[id]/expiry/route');
    expect((await PUT(put({ expiresAt: null }), { params })).status).toBe(404);
  });

  it('sets an expiration date', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    dbMock.select.mockReturnValue(chainable([OWN_PAGE]));
    const captured = captureUpdate();
    const { PUT } = await import('@/app/api/pages/[id]/expiry/route');

    const expiresAt = new Date(Date.now() + HOUR).toISOString();
    const body = await (await PUT(put({ expiresAt }), { params })).json();
    expect(body.expiresAt).toBe(expiresAt);
    expect(captured.set.expiresAt).toEqual(new Date(expiresAt));
  });

  it('removes the expiration when null', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    dbMock.select.mockReturnValue(chainable([{ ...OWN_PAGE, expiresAt: new Date(Date.now() + HOUR) }]));
    const captured = captureUpdate();
    const { PUT } = await import('@/app/api/pages/[id]/expiry/route');

    const body = await (await PUT(put({ expiresAt: null }), { params })).json();
    expect(body.expiresAt).toBeNull();
    expect(captured.set.expiresAt).toBeNull();
  });

  it('rejects a past date', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    dbMock.select.mockReturnValue(chainable([OWN_PAGE]));
    const { PUT } = await import('@/app/api/pages/[id]/expiry/route');

    const response = await PUT(put({ expiresAt: new Date(Date.now() - HOUR).toISOString() }), { params });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('INVALID_EXPIRY');
  });

  it('rejects a body without expiresAt', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    dbMock.select.mockReturnValue(chainable([OWN_PAGE]));
    const { PUT } = await import('@/app/api/pages/[id]/expiry/route');
    expect((await PUT(put({}), { params })).status).toBe(400);
  });
});
