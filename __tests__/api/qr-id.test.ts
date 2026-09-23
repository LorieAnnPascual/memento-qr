import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { chainable, createDbMock } from '../helpers/db-mock';

const dbMock = createDbMock();
const getCurrentUserMock = vi.fn();

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: getCurrentUserMock }));

const AUTHED_USER = { authId: 'auth-1', email: 'test@memento.local', profile: { id: 'profile-1' } };
const params = Promise.resolve({ id: 'qr-1' });

describe('GET /api/qr/[id]', () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    getCurrentUserMock.mockReset();
  });

  it('returns 401 without authentication', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { GET } = await import('@/app/api/qr/[id]/route');

    const response = await GET(new NextRequest('http://localhost:3000/api/qr/qr-1'), { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 when the QR code does not exist or belongs to another user', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    dbMock.select.mockReturnValue(chainable([]));
    const { GET } = await import('@/app/api/qr/[id]/route');

    const response = await GET(new NextRequest('http://localhost:3000/api/qr/qr-1'), { params });
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe('QR_NOT_FOUND');
  });

  it('returns the QR code on success', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    const qrCode = { id: 'qr-1', name: 'Test QR' };
    dbMock.select.mockReturnValue(chainable([qrCode]));
    const { GET } = await import('@/app/api/qr/[id]/route');

    const response = await GET(new NextRequest('http://localhost:3000/api/qr/qr-1'), { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(qrCode);
  });
});

describe('PUT /api/qr/[id]', () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    dbMock.update.mockReset();
    getCurrentUserMock.mockReset();
  });

  it('returns 401 without authentication', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { PUT } = await import('@/app/api/qr/[id]/route');

    const request = new NextRequest('http://localhost:3000/api/qr/qr-1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated' }),
    });
    const response = await PUT(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid update data', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    const { PUT } = await import('@/app/api/qr/[id]/route');

    const request = new NextRequest('http://localhost:3000/api/qr/qr-1', {
      method: 'PUT',
      body: JSON.stringify({ qrType: 'not-a-real-type' }),
    });
    const response = await PUT(request, { params });
    expect(response.status).toBe(400);
  });

  it('returns 404 when updating a QR code that does not exist', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    dbMock.select.mockReturnValue(chainable([]));
    const { PUT } = await import('@/app/api/qr/[id]/route');

    const request = new NextRequest('http://localhost:3000/api/qr/qr-1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated' }),
    });
    const response = await PUT(request, { params });
    expect(response.status).toBe(404);
  });

  it('updates the QR code on success', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    dbMock.select.mockReturnValue(chainable([{ id: 'qr-1' }]));
    dbMock.update.mockReturnValue(chainable([{ id: 'qr-1', name: 'Updated' }]));
    const { PUT } = await import('@/app/api/qr/[id]/route');

    const request = new NextRequest('http://localhost:3000/api/qr/qr-1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated' }),
    });
    const response = await PUT(request, { params });
    expect(response.status).toBe(200);
    expect((await response.json()).name).toBe('Updated');
  });

  it('generates a short link and redirects content into targetUrl when turning a static QR dynamic', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    dbMock.select.mockReturnValue(
      chainable([
        { id: 'qr-1', isDynamic: false, shortCode: null, targetUrl: null, payload: 'https://old.example.com' },
      ]),
    );
    let capturedSet: Record<string, unknown> = {};
    dbMock.update.mockReturnValue({
      set: (v: Record<string, unknown>) => {
        capturedSet = v;
        return chainable([{ id: 'qr-1', ...v }]);
      },
    });

    const { PUT } = await import('@/app/api/qr/[id]/route');
    const request = new NextRequest('http://localhost:3000/api/qr/qr-1', {
      method: 'PUT',
      body: JSON.stringify({ isDynamic: true, payload: 'https://new-destination.example.com' }),
    });
    await PUT(request, { params });

    expect(capturedSet.isDynamic).toBe(true);
    expect(capturedSet.shortCode).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/);
    expect(capturedSet.targetUrl).toBe('https://new-destination.example.com');
    expect(capturedSet.payload).toBe(`http://localhost:3000/q/${capturedSet.shortCode}`);
  });

  it('keeps the same short link when only the destination content changes', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    dbMock.select.mockReturnValue(
      chainable([
        {
          id: 'qr-1',
          isDynamic: true,
          shortCode: 'abc123',
          targetUrl: 'https://old-destination.example.com',
          payload: 'http://localhost:3000/q/abc123',
        },
      ]),
    );
    let capturedSet: Record<string, unknown> = {};
    dbMock.update.mockReturnValue({
      set: (v: Record<string, unknown>) => {
        capturedSet = v;
        return chainable([{ id: 'qr-1', ...v }]);
      },
    });

    const { PUT } = await import('@/app/api/qr/[id]/route');
    const request = new NextRequest('http://localhost:3000/api/qr/qr-1', {
      method: 'PUT',
      body: JSON.stringify({ payload: 'https://new-destination.example.com' }),
    });
    await PUT(request, { params });

    expect(capturedSet.shortCode).toBe('abc123');
    expect(capturedSet.payload).toBe('http://localhost:3000/q/abc123');
    expect(capturedSet.targetUrl).toBe('https://new-destination.example.com');
  });

  it('reverts to encoding the content directly when turning dynamic off', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    dbMock.select.mockReturnValue(
      chainable([
        {
          id: 'qr-1',
          isDynamic: true,
          shortCode: 'abc123',
          targetUrl: 'https://destination.example.com',
          payload: 'http://localhost:3000/q/abc123',
        },
      ]),
    );
    let capturedSet: Record<string, unknown> = {};
    dbMock.update.mockReturnValue({
      set: (v: Record<string, unknown>) => {
        capturedSet = v;
        return chainable([{ id: 'qr-1', ...v }]);
      },
    });

    const { PUT } = await import('@/app/api/qr/[id]/route');
    const request = new NextRequest('http://localhost:3000/api/qr/qr-1', {
      method: 'PUT',
      body: JSON.stringify({ isDynamic: false }),
    });
    await PUT(request, { params });

    expect(capturedSet.isDynamic).toBe(false);
    expect(capturedSet.targetUrl).toBeNull();
    expect(capturedSet.payload).toBe('https://destination.example.com');
  });
});

describe('DELETE /api/qr/[id]', () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    dbMock.update.mockReset();
    getCurrentUserMock.mockReset();
  });

  it('returns 401 without authentication', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/qr/[id]/route');

    const response = await DELETE(new NextRequest('http://localhost:3000/api/qr/qr-1'), { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 when deleting a QR code that does not exist', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    dbMock.select.mockReturnValue(chainable([]));
    const { DELETE } = await import('@/app/api/qr/[id]/route');

    const response = await DELETE(new NextRequest('http://localhost:3000/api/qr/qr-1'), { params });
    expect(response.status).toBe(404);
  });

  it('soft-deletes the QR code on success', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    dbMock.select.mockReturnValue(chainable([{ id: 'qr-1' }]));
    dbMock.update.mockReturnValue(chainable([]));
    const { DELETE } = await import('@/app/api/qr/[id]/route');

    const response = await DELETE(new NextRequest('http://localhost:3000/api/qr/qr-1'), { params });
    expect(response.status).toBe(204);
    expect(dbMock.update).toHaveBeenCalled();
  });
});
