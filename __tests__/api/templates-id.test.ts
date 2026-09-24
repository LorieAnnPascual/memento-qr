import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { chainable, createDbMock } from '../helpers/db-mock';

const dbMock = createDbMock();
const getCurrentUserMock = vi.fn();

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: getCurrentUserMock }));

const AUTHED_USER = { authId: 'auth-1', email: 'test@memento.local', profile: { id: 'profile-1' } };
const params = Promise.resolve({ id: 'tpl-1' });

describe('GET /api/templates/[id]', () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    getCurrentUserMock.mockReset();
  });

  it('returns 401 without authentication', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { GET } = await import('@/app/api/templates/[id]/route');

    const response = await GET(new NextRequest('http://localhost:3000/api/templates/tpl-1'), { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 when the template does not exist', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    dbMock.select.mockReturnValue(chainable([]));
    const { GET } = await import('@/app/api/templates/[id]/route');

    const response = await GET(new NextRequest('http://localhost:3000/api/templates/tpl-1'), { params });
    expect(response.status).toBe(404);
  });

  it("returns 404 for a template that does not exist", async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    dbMock.select.mockReturnValue(chainable([]));
    const { GET } = await import('@/app/api/templates/[id]/route');

    const response = await GET(new NextRequest('http://localhost:3000/api/templates/tpl-1'), { params });
    expect(response.status).toBe(404);
  });

  it('returns the template on success', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    const template = { id: 'tpl-1', isPublic: true, userId: null, name: 'Classic Black' };
    dbMock.select.mockReturnValue(chainable([template]));
    const { GET } = await import('@/app/api/templates/[id]/route');

    const response = await GET(new NextRequest('http://localhost:3000/api/templates/tpl-1'), { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(template);
  });
});

describe('PUT /api/templates/[id]', () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    dbMock.update.mockReset();
    getCurrentUserMock.mockReset();
  });

  it('returns 401 without authentication', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { PUT } = await import('@/app/api/templates/[id]/route');

    const request = new NextRequest('http://localhost:3000/api/templates/tpl-1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated' }),
    });
    const response = await PUT(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 when the template does not exist', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    dbMock.select.mockReturnValue(chainable([]));
    const { PUT } = await import('@/app/api/templates/[id]/route');

    const request = new NextRequest('http://localhost:3000/api/templates/tpl-1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated' }),
    });
    const response = await PUT(request, { params });
    expect(response.status).toBe(404);
  });

  it('returns 403 when editing a system template', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    dbMock.select.mockReturnValue(chainable([{ id: 'tpl-1', isSystem: true, userId: null }]));
    const { PUT } = await import('@/app/api/templates/[id]/route');

    const request = new NextRequest('http://localhost:3000/api/templates/tpl-1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated' }),
    });
    const response = await PUT(request, { params });
    expect(response.status).toBe(403);
  });

  it("returns 403 when editing a built-in template", async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    dbMock.select.mockReturnValue(
      chainable([{ id: 'tpl-1', isSystem: true, userId: null }]),
    );
    const { PUT } = await import('@/app/api/templates/[id]/route');

    const request = new NextRequest('http://localhost:3000/api/templates/tpl-1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated' }),
    });
    const response = await PUT(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns 400 for invalid update data', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    dbMock.select.mockReturnValue(chainable([{ id: 'tpl-1', isSystem: false, userId: 'profile-1' }]));
    const { PUT } = await import('@/app/api/templates/[id]/route');

    const request = new NextRequest('http://localhost:3000/api/templates/tpl-1', {
      method: 'PUT',
      body: JSON.stringify({ category: 'not-a-real-category' }),
    });
    const response = await PUT(request, { params });
    expect(response.status).toBe(400);
  });

  it('updates the template on success', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    dbMock.select.mockReturnValue(chainable([{ id: 'tpl-1', isSystem: false, userId: 'profile-1' }]));
    dbMock.update.mockReturnValue(chainable([{ id: 'tpl-1', name: 'Updated' }]));
    const { PUT } = await import('@/app/api/templates/[id]/route');

    const request = new NextRequest('http://localhost:3000/api/templates/tpl-1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated' }),
    });
    const response = await PUT(request, { params });
    expect(response.status).toBe(200);
    expect((await response.json()).name).toBe('Updated');
  });
});

describe('DELETE /api/templates/[id]', () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    dbMock.delete.mockReset();
    getCurrentUserMock.mockReset();
  });

  it('returns 401 without authentication', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/templates/[id]/route');

    const response = await DELETE(new NextRequest('http://localhost:3000/api/templates/tpl-1'), { params });
    expect(response.status).toBe(401);
  });

  it('returns 403 when deleting a system template', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    dbMock.select.mockReturnValue(chainable([{ id: 'tpl-1', isSystem: true, userId: null }]));
    const { DELETE } = await import('@/app/api/templates/[id]/route');

    const response = await DELETE(new NextRequest('http://localhost:3000/api/templates/tpl-1'), { params });
    expect(response.status).toBe(403);
  });

  it('deletes the template on success', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    dbMock.select.mockReturnValue(chainable([{ id: 'tpl-1', isSystem: false, userId: 'profile-1' }]));
    dbMock.delete.mockReturnValue(chainable([]));
    const { DELETE } = await import('@/app/api/templates/[id]/route');

    const response = await DELETE(new NextRequest('http://localhost:3000/api/templates/tpl-1'), { params });
    expect(response.status).toBe(204);
  });
});
