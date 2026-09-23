import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { chainable, createDbMock } from '../helpers/db-mock';

const dbMock = createDbMock();
const getCurrentUserMock = vi.fn();

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: getCurrentUserMock }));

const AUTHED_USER = { authId: 'auth-1', email: 'test@memento.local', profile: { id: 'profile-1' } };

describe('GET /api/templates', () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    getCurrentUserMock.mockReset();
  });

  it('returns 401 without authentication', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { GET } = await import('@/app/api/templates/route');

    const response = await GET(new NextRequest('http://localhost:3000/api/templates'));
    expect(response.status).toBe(401);
  });

  it('returns the visible templates', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    const items = [{ id: 'tpl-1', name: 'Classic Black', isSystem: true }];
    dbMock.select.mockReturnValue(chainable(items));

    const { GET } = await import('@/app/api/templates/route');
    const response = await GET(new NextRequest('http://localhost:3000/api/templates'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items });
  });
});

describe('POST /api/templates', () => {
  beforeEach(() => {
    dbMock.insert.mockReset();
    getCurrentUserMock.mockReset();
  });

  it('returns 401 without authentication', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { POST } = await import('@/app/api/templates/route');

    const request = new NextRequest('http://localhost:3000/api/templates', {
      method: 'POST',
      body: JSON.stringify({ name: 'My template', styleConfig: {} }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid template data', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    const { POST } = await import('@/app/api/templates/route');

    const request = new NextRequest('http://localhost:3000/api/templates', {
      method: 'POST',
      body: JSON.stringify({ name: '' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('creates a custom template on success', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    const created = { id: 'tpl-2', name: 'My template', isSystem: false };
    dbMock.insert.mockReturnValue(chainable([created]));

    const { POST } = await import('@/app/api/templates/route');
    const request = new NextRequest('http://localhost:3000/api/templates', {
      method: 'POST',
      body: JSON.stringify({ name: 'My template', category: 'custom', styleConfig: { dotColor: '#000' } }),
    });
    const response = await POST(request);

    expect(response.status).toBe(201);
    expect((await response.json()).id).toBe('tpl-2');
  });
});
