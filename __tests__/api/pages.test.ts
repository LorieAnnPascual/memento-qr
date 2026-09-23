import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { chainable, createDbMock } from '../helpers/db-mock';

const dbMock = createDbMock();
const getCurrentUserMock = vi.fn();

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: getCurrentUserMock }));

const USER = { authId: 'auth-1', email: 't@memento.local', profile: { id: 'profile-1' } };
const params = Promise.resolve({ id: 'page-1' });
const OWN_PAGE = { id: 'page-1', userId: 'profile-1', isSystem: false, name: 'Mine', puckData: { content: [] } };

function req(url: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, init);
}

describe('GET /api/pages', () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    getCurrentUserMock.mockReset();
  });

  it('returns 401 without authentication', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { GET } = await import('@/app/api/pages/route');
    expect((await GET(req('/api/pages'))).status).toBe(401);
  });

  it('lists the current user\'s pages', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    dbMock.select.mockReturnValue(chainable([OWN_PAGE]));
    const { GET } = await import('@/app/api/pages/route');

    const response = await GET(req('/api/pages?category=memorial'));
    expect(response.status).toBe(200);
    expect((await response.json()).items).toEqual([OWN_PAGE]);
  });
});

describe('POST /api/pages', () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    dbMock.insert.mockReset();
    getCurrentUserMock.mockReset();
  });

  function captureInsert() {
    const captured: { values: Record<string, unknown> } = { values: {} };
    dbMock.insert.mockReturnValue({
      values: (v: Record<string, unknown>) => {
        captured.values = v;
        return chainable([{ id: 'new-page', ...v }]);
      },
    });
    return captured;
  }

  const post = (body: unknown) =>
    req('/api/pages', { method: 'POST', body: JSON.stringify(body) });

  it('returns 401 without authentication', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { POST } = await import('@/app/api/pages/route');
    expect((await POST(post({ name: 'x' }))).status).toBe(401);
  });

  it('returns 400 for an invalid body', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    const { POST } = await import('@/app/api/pages/route');

    const response = await POST(post({ name: '' }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('VALIDATION_ERROR');
  });

  it('creates a private blank page owned by the user', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    const captured = captureInsert();
    const { POST } = await import('@/app/api/pages/route');

    const response = await POST(post({ name: 'My page' }));
    expect(response.status).toBe(201);
    expect(captured.values).toMatchObject({
      userId: 'profile-1',
      name: 'My page',
      isPublic: false,
      isSystem: false,
      category: 'custom',
      puckData: { content: [] },
    });
  });

  it('duplicates a template\'s design and category', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    const design = { root: {}, content: [{ type: 'Footer', props: { id: 'f' } }], zones: {} };
    dbMock.select.mockReturnValue(chainable([{ id: 'tpl', category: 'pet', puckData: design }]));
    const captured = captureInsert();
    const { POST } = await import('@/app/api/pages/route');

    const response = await POST(post({ name: 'Buddy', fromTemplateId: '11111111-1111-4111-8111-111111111111' }));
    expect(response.status).toBe(201);
    expect(captured.values.puckData).toEqual(design);
    expect(captured.values.category).toBe('pet');
    expect(captured.values.isSystem).toBe(false);
  });

  it('returns 404 when the source template is not visible', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    dbMock.select.mockReturnValue(chainable([]));
    const { POST } = await import('@/app/api/pages/route');

    const response = await POST(post({ name: 'x', fromTemplateId: '11111111-1111-4111-8111-111111111111' }));
    expect(response.status).toBe(404);
  });
});

describe('GET/PUT/DELETE /api/pages/[id]', () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    dbMock.update.mockReset();
    dbMock.delete.mockReset();
    getCurrentUserMock.mockReset();
  });

  it('GET returns 404 for a page that is not visible', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    dbMock.select.mockReturnValue(chainable([]));
    const { GET } = await import('@/app/api/pages/[id]/route');
    expect((await GET(req('/api/pages/page-1'), { params })).status).toBe(404);
  });

  it('PUT returns 401 without authentication', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { PUT } = await import('@/app/api/pages/[id]/route');
    expect((await PUT(req('/api/pages/page-1', { method: 'PUT', body: '{}' }), { params })).status).toBe(401);
  });

  it('PUT returns 404 for a missing page', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    dbMock.select.mockReturnValue(chainable([]));
    const { PUT } = await import('@/app/api/pages/[id]/route');
    expect((await PUT(req('/api/pages/page-1', { method: 'PUT', body: '{}' }), { params })).status).toBe(404);
  });

  it('PUT refuses to edit a system template', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    dbMock.select.mockReturnValue(chainable([{ ...OWN_PAGE, isSystem: true, userId: null }]));
    const { PUT } = await import('@/app/api/pages/[id]/route');

    const response = await PUT(req('/api/pages/page-1', { method: 'PUT', body: JSON.stringify({ name: 'x' }) }), { params });
    expect(response.status).toBe(403);
  });

  it('PUT refuses to edit another user\'s page', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    dbMock.select.mockReturnValue(chainable([{ ...OWN_PAGE, userId: 'someone-else' }]));
    const { PUT } = await import('@/app/api/pages/[id]/route');

    const response = await PUT(req('/api/pages/page-1', { method: 'PUT', body: JSON.stringify({ name: 'x' }) }), { params });
    expect(response.status).toBe(403);
  });

  it('PUT returns 400 for an invalid design', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    dbMock.select.mockReturnValue(chainable([OWN_PAGE]));
    const { PUT } = await import('@/app/api/pages/[id]/route');

    const response = await PUT(req('/api/pages/page-1', { method: 'PUT', body: JSON.stringify({ puckData: { nope: 1 } }) }), { params });
    expect(response.status).toBe(400);
  });

  it('PUT saves the design', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    dbMock.select.mockReturnValue(chainable([OWN_PAGE]));
    let captured: Record<string, unknown> = {};
    dbMock.update.mockReturnValue({
      set: (v: Record<string, unknown>) => {
        captured = v;
        return chainable([{ ...OWN_PAGE, ...v }]);
      },
    });
    const { PUT } = await import('@/app/api/pages/[id]/route');

    const puckData = { root: {}, content: [], zones: {} };
    const response = await PUT(req('/api/pages/page-1', { method: 'PUT', body: JSON.stringify({ name: 'Renamed', puckData }) }), { params });
    expect(response.status).toBe(200);
    expect(captured).toMatchObject({ name: 'Renamed', puckData });
  });

  it('DELETE refuses a page the user does not own', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    dbMock.select.mockReturnValue(chainable([{ ...OWN_PAGE, userId: 'someone-else' }]));
    const { DELETE } = await import('@/app/api/pages/[id]/route');

    expect((await DELETE(req('/api/pages/page-1', { method: 'DELETE' }), { params })).status).toBe(403);
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it('DELETE removes an owned page', async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    dbMock.select.mockReturnValue(chainable([OWN_PAGE]));
    dbMock.delete.mockReturnValue(chainable([]));
    const { DELETE } = await import('@/app/api/pages/[id]/route');

    expect((await DELETE(req('/api/pages/page-1', { method: 'DELETE' }), { params })).status).toBe(204);
    expect(dbMock.delete).toHaveBeenCalled();
  });
});
