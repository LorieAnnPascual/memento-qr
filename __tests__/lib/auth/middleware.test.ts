import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getUserMock = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: getUserMock },
  })),
}));

const request = (path: string): NextRequest => new NextRequest(`http://localhost:3000${path}`);

describe('updateSession', () => {
  beforeEach(() => {
    getUserMock.mockReset();
  });

  it('returns a 401 JSON response for unauthenticated API requests', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { updateSession } = await import('@/lib/auth/middleware');

    const response = await updateSession(request('/api/qr'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  });

  it('redirects unauthenticated page requests to /login', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { updateSession } = await import('@/lib/auth/middleware');

    const response = await updateSession(request('/settings'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login');
  });

  it('allows unauthenticated requests to public paths through', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { updateSession } = await import('@/lib/auth/middleware');

    expect((await updateSession(request('/login'))).status).toBe(200);
  });

  it('redirects authenticated users away from /login', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const { updateSession } = await import('@/lib/auth/middleware');

    const response = await updateSession(request('/login'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/');
  });

  it('allows authenticated requests to protected API routes through', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const { updateSession } = await import('@/lib/auth/middleware');

    expect((await updateSession(request('/api/qr'))).status).toBe(200);
  });

  it('remembers where the visitor was going', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { updateSession } = await import('@/lib/auth/middleware');

    const response = await updateSession(request('/qr/abc'));

    expect(new URL(response.headers.get('location')!).searchParams.get('redirectTo')).toBe('/qr/abc');
  });

  it.each(['/', '/qr', '/qr/new', '/qr/batch', '/qr/compare', '/templates', '/pages', '/pages/new', '/analytics', '/media', '/settings', '/activity'])(
    'sends signed-out visitors from %s to login',
    async (path) => {
      getUserMock.mockResolvedValue({ data: { user: null } });
      const { updateSession } = await import('@/lib/auth/middleware');

      const response = await updateSession(request(path));

      expect(response.status).toBe(307);
      expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
    },
  );

  it.each(['/api/qr', '/api/pages', '/api/folders', '/api/export', '/api/upload', '/api/analytics'])(
    'answers 401 (not a redirect) for signed-out %s',
    async (path) => {
      getUserMock.mockResolvedValue({ data: { user: null } });
      const { updateSession } = await import('@/lib/auth/middleware');

      expect((await updateSession(request(path))).status).toBe(401);
    },
  );

  it.each(['/q/abc234', '/p/abc234', '/api/cron/keep-alive'])('serves %s without ever asking Supabase who is there', async (path) => {
    const { updateSession } = await import('@/lib/auth/middleware');

    const response = await updateSession(request(path));

    expect(response.status).toBe(200);
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it.each(['/login', '/forgot-password', '/auth/confirm'])('lets signed-out visitors reach %s', async (path) => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { updateSession } = await import('@/lib/auth/middleware');

    expect((await updateSession(request(path))).status).toBe(200);
  });
});
