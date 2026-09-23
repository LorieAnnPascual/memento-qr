// @vitest-environment node
//
// jsdom's FormData/File bindings aren't compatible with the undici-based
// FormData parsing NextRequest does internally when constructed with a
// multipart body, so this file runs in the plain Node environment instead.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { chainable, createDbMock } from '../helpers/db-mock';

const dbMock = createDbMock();
const getCurrentUserMock = vi.fn();
const uploadFileMock = vi.fn();

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock('@/lib/storage', () => ({ uploadFile: uploadFileMock }));

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const pngFile = (name = 'logo.png') => new File([PNG_BYTES], name, { type: 'image/png' });

const AUTHED_USER = { authId: 'auth-1', email: 'test@memento.local', profile: { id: 'profile-1' } };

function makeUploadRequest(file: File | null): NextRequest {
  const formData = new FormData();
  if (file) formData.set('file', file);
  return new NextRequest('http://localhost:3000/api/upload', { method: 'POST', body: formData });
}

describe('POST /api/upload', () => {
  beforeEach(() => {
    dbMock.insert.mockReset();
    getCurrentUserMock.mockReset();
    uploadFileMock.mockReset();
  });

  it('returns 401 without authentication', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { POST } = await import('@/app/api/upload/route');

    const response = await POST(makeUploadRequest(pngFile()));
    expect(response.status).toBe(401);
  });

  it('returns 400 when no file is provided', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    const { POST } = await import('@/app/api/upload/route');

    const response = await POST(makeUploadRequest(null));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('VALIDATION_ERROR');
  });

  it('rejects unsupported file types', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    const { POST } = await import('@/app/api/upload/route');

    const file = new File(['x'], 'logo.gif', { type: 'image/gif' });
    const response = await POST(makeUploadRequest(file));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('rejects files over the size limit', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    const { POST } = await import('@/app/api/upload/route');

    const oversized = new File([PNG_BYTES, new Uint8Array(600 * 1024)], 'logo.png', { type: 'image/png' });
    const response = await POST(makeUploadRequest(oversized));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('FILE_TOO_LARGE');
  });

  it('uploads the file and records it on success', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    uploadFileMock.mockResolvedValue({
      storagePath: 'profile-1/abc.png',
      publicUrl: 'https://storage.example.com/profile-1/abc.png',
    });
    dbMock.insert.mockReturnValue(chainable([{ id: 'file-1' }]));
    const { POST } = await import('@/app/api/upload/route');

    const file = pngFile();
    const response = await POST(makeUploadRequest(file));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ url: 'https://storage.example.com/profile-1/abc.png', id: 'file-1' });
  });

  it('returns 500 when the storage upload fails', async () => {
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
    uploadFileMock.mockRejectedValue(new Error('storage down'));
    const { POST } = await import('@/app/api/upload/route');

    const file = pngFile();
    const response = await POST(makeUploadRequest(file));

    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe('UPLOAD_FAILED');
  });
});

describe('POST /api/upload content checks', () => {
  beforeEach(() => {
    dbMock.insert.mockReset();
    getCurrentUserMock.mockReset();
    uploadFileMock.mockReset();
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
  });

  async function post(file: File) {
    const { POST } = await import('@/app/api/upload/route');
    return POST(makeUploadRequest(file));
  }

  it('rejects an executable renamed to .png', async () => {
    const exe = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03])], 'photo.png', { type: 'image/png' });

    const response = await post(exe);

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(uploadFileMock).not.toHaveBeenCalled();
  });

  it('rejects HTML sent as an image', async () => {
    const html = new File(['<html><script>alert(1)</script></html>'], 'photo.png', { type: 'image/png' });

    expect((await post(html)).status).toBe(400);
    expect(uploadFileMock).not.toHaveBeenCalled();
  });

  it('rejects a real PNG that claims to be a JPEG', async () => {
    const mismatch = new File([PNG_BYTES], 'photo.jpg', { type: 'image/jpeg' });

    const response = await post(mismatch);

    expect(response.status).toBe(400);
    expect(uploadFileMock).not.toHaveBeenCalled();
  });

  it('rejects an SVG that contains a script', async () => {
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], 'x.svg', { type: 'image/svg+xml' });

    const response = await post(svg);

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('UNSAFE_SVG');
  });

  it('accepts a clean SVG', async () => {
    uploadFileMock.mockResolvedValue({ storagePath: 'p/a.svg', publicUrl: 'https://s.example/a.svg' });
    dbMock.insert.mockReturnValue(chainable([{ id: 'f1' }]));
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'], 'x.svg', { type: 'image/svg+xml' });

    expect((await post(svg)).status).toBe(201);
  });

  it('builds the storage path from the verified type, not the file name', async () => {
    uploadFileMock.mockResolvedValue({ storagePath: 'p/a.png', publicUrl: 'https://s.example/a.png' });
    const values = vi.fn(() => chainable([{ id: 'f1' }]));
    dbMock.insert.mockReturnValue({ values });

    await post(pngFile('../../../etc/passwd.png/../../evil'));

    const [path] = uploadFileMock.mock.calls[0].slice(1) as [string];
    expect(path).toMatch(/^profile-1\/[A-Za-z0-9_-]+\.png$/);
    expect(path).not.toContain('..');
    const [saved] = values.mock.calls[0] as unknown as [{ fileName: string }];
    expect(saved.fileName).not.toMatch(/[\\/]/);
  });
});
