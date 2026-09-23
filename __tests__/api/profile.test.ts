import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { chainable, createDbMock } from '../helpers/db-mock';

const dbMock = createDbMock();
const getUserMock = vi.fn();

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/auth/supabase-server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: getUserMock },
    }),
  ),
}));

describe('PUT /api/profile', () => {
  beforeEach(() => {
    dbMock.update.mockReset();
    getUserMock.mockReset();
  });

  it('returns 401 without authentication', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { PUT } = await import('@/app/api/profile/route');

    const request = new NextRequest('http://localhost:3000/api/profile', {
      method: 'PUT',
      body: JSON.stringify({ fullName: 'Jane Doe' }),
    });
    const response = await PUT(request);
    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid data', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'auth-1' } } });
    const { PUT } = await import('@/app/api/profile/route');

    const request = new NextRequest('http://localhost:3000/api/profile', {
      method: 'PUT',
      body: JSON.stringify({ fullName: '' }),
    });
    const response = await PUT(request);
    expect(response.status).toBe(400);
  });

  it('returns 404 when no profile row exists for the auth user', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'auth-1' } } });
    dbMock.update.mockReturnValue(chainable([]));
    const { PUT } = await import('@/app/api/profile/route');

    const request = new NextRequest('http://localhost:3000/api/profile', {
      method: 'PUT',
      body: JSON.stringify({ fullName: 'Jane Doe' }),
    });
    const response = await PUT(request);
    expect(response.status).toBe(404);
  });

  it('updates the profile on success', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'auth-1' } } });
    dbMock.update.mockReturnValue(chainable([{ id: 'profile-1', fullName: 'Jane Doe' }]));
    const { PUT } = await import('@/app/api/profile/route');

    const request = new NextRequest('http://localhost:3000/api/profile', {
      method: 'PUT',
      body: JSON.stringify({ fullName: 'Jane Doe' }),
    });
    const response = await PUT(request);
    expect(response.status).toBe(200);
    expect((await response.json()).fullName).toBe('Jane Doe');
  });
});
