import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

import { chainable, createDbMock } from '../helpers/db-mock';

const dbMock = createDbMock();
const getCurrentUserMock = vi.fn();

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: getCurrentUserMock }));

const AUTHED_USER = { authId: 'auth-1', email: 'test@memento.local', profile: { id: 'profile-1' } };

describe('GET /api/qr', () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    getCurrentUserMock.mockReset();
  });

  it('returns 401 without authentication', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { GET } = await import('@/app/api/qr/route');

    const response = await GET(new NextRequest('http://localhost:3000/api/qr'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  });

  it('returns a paginated list for the current user', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    const items = [{ id: 'qr-1', name: 'Test QR' }];
    dbMock.select
      .mockReturnValueOnce(chainable(items))
      .mockReturnValueOnce(chainable([{ total: 1 }]));

    const { GET } = await import('@/app/api/qr/route');
    const response = await GET(new NextRequest('http://localhost:3000/api/qr'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ items, total: 1, page: 1, limit: 20 });
  });

  it('returns an empty list when there are no results', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    dbMock.select.mockReturnValueOnce(chainable([])).mockReturnValueOnce(chainable([{ total: 0 }]));

    const { GET } = await import('@/app/api/qr/route');
    const response = await GET(new NextRequest('http://localhost:3000/api/qr'));

    const body = await response.json();
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });
});

describe('POST /api/qr', () => {
  beforeEach(() => {
    dbMock.insert.mockReset();
    getCurrentUserMock.mockReset();
  });

  it('returns 401 without authentication', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { POST } = await import('@/app/api/qr/route');

    const request = new NextRequest('http://localhost:3000/api/qr', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', qrType: 'url', payload: 'https://example.com', styleConfig: {} }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid payload', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    const { POST } = await import('@/app/api/qr/route');

    const request = new NextRequest('http://localhost:3000/api/qr', {
      method: 'POST',
      body: JSON.stringify({ name: '', qrType: 'url' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('creates a QR code with valid data', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    const created = { id: 'qr-1', name: 'Test QR', qrType: 'url' };
    dbMock.insert.mockReturnValue(chainable([created]));

    const { POST } = await import('@/app/api/qr/route');
    const request = new NextRequest('http://localhost:3000/api/qr', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test QR',
        qrType: 'url',
        payload: 'https://example.com',
        styleConfig: { dotColor: '#000000' },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBe('qr-1');
  });

  it('encodes a short redirect link — not the destination — for a dynamic QR', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    let captured: Record<string, unknown> | null = null;
    dbMock.insert.mockReturnValue({
      values: (v: Record<string, unknown>) => {
        // The first insert is the QR code; a later one records its destination history.
        captured ??= v;
        return chainable([{ id: 'qr-1', ...v }]);
      },
    });

    const { POST } = await import('@/app/api/qr/route');
    const request = new NextRequest('http://localhost:3000/api/qr', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Dynamic QR',
        qrType: 'url',
        payload: 'https://example.com',
        styleConfig: {},
        isDynamic: true,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    const capturedValues = captured as unknown as Record<string, unknown>;
    expect(capturedValues.isDynamic).toBe(true);
    expect(capturedValues.shortCode).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/);
    expect(capturedValues.targetUrl).toBe('https://example.com');
    expect(capturedValues.payload).toBe(`http://localhost:3000/q/${capturedValues.shortCode}`);
  });

  it('encodes the content directly for a static QR', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    let capturedValues: Record<string, unknown> = {};
    dbMock.insert.mockReturnValue({
      values: (v: Record<string, unknown>) => {
        capturedValues = v;
        return chainable([{ id: 'qr-1', ...v }]);
      },
    });

    const { POST } = await import('@/app/api/qr/route');
    const request = new NextRequest('http://localhost:3000/api/qr', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Static QR',
        qrType: 'url',
        payload: 'https://example.com',
        styleConfig: {},
      }),
    });

    await POST(request);
    expect(capturedValues.isDynamic).toBe(false);
    expect(capturedValues.shortCode).toBeNull();
    expect(capturedValues.targetUrl).toBeNull();
    expect(capturedValues.payload).toBe('https://example.com');
  });

  describe('video codes', () => {
    const video = {
      name: 'Ana memorial',
      qrType: 'video',
      payload: 'http://localhost:3000/media/p/f.mp4',
      payloadFields: { videoUrl: 'http://localhost:3000/media/p/f.mp4', fileName: 'f.mp4', fileSize: 10 },
      styleConfig: {},
    };

    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('refuses a video address that is not one of our hosted videos (INVALID_VIDEO) and writes nothing', async () => {
      getCurrentUserMock.mockResolvedValue(AUTHED_USER);
      dbMock.insert.mockReset();
      const { POST } = await import('@/app/api/qr/route');

      for (const bad of ['https://evil.example/clip.mp4', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'not a url', 'http://localhost:3000/media/a/b/c.mp4']) {
        const response = await POST(
          new NextRequest('http://localhost:3000/api/qr', { method: 'POST', body: JSON.stringify({ ...video, payload: bad }) }),
        );

        expect(response.status).toBe(400);
        expect((await response.json()).code).toBe('INVALID_VIDEO');
      }
      expect(dbMock.insert).not.toHaveBeenCalled();
    });

    it('is always created as a dynamic code, even when the request does not say so', async () => {
      getCurrentUserMock.mockResolvedValue(AUTHED_USER);
      let first: Record<string, unknown> | null = null;
      dbMock.insert.mockReturnValue({
        values: (v: Record<string, unknown>) => {
          first ??= v;
          return chainable([{ id: 'qr-1', ...v }]);
        },
      });
      const { POST } = await import('@/app/api/qr/route');

      const response = await POST(
        new NextRequest('http://localhost:3000/api/qr', { method: 'POST', body: JSON.stringify(video) }),
      );

      const inserted = first as unknown as Record<string, unknown>;
      expect(response.status).toBe(201);
      expect(inserted.isDynamic).toBe(true);
      expect(inserted.shortCode).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/);
      expect(inserted.targetUrl).toBe(video.payload);
      expect(inserted.payload).toBe(`http://localhost:3000/q/${inserted.shortCode}`);
    });

    it('refuses an explicit static video code with VIDEO_MUST_BE_DYNAMIC and writes nothing', async () => {
      getCurrentUserMock.mockResolvedValue(AUTHED_USER);
      dbMock.insert.mockReset();
      const { POST } = await import('@/app/api/qr/route');

      const response = await POST(
        new NextRequest('http://localhost:3000/api/qr', {
          method: 'POST',
          body: JSON.stringify({ ...video, isDynamic: false }),
        }),
      );

      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe('VIDEO_MUST_BE_DYNAMIC');
      expect(dbMock.insert).not.toHaveBeenCalled();
    });
  });
});
