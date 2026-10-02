import { describe, it, expect, vi, beforeEach } from 'vitest';

import { chainable, createDbMock } from '../helpers/db-mock';

const dbMock = createDbMock();
const getCurrentUserMock = vi.fn();
const storageMock = {
  createSignedUpload: vi.fn(),
  getStoredObject: vi.fn(),
  readStoredHead: vi.fn(),
  deleteFile: vi.fn(),
};

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock('@/lib/storage', () => storageMock);

const PROFILE_ID = '11111111-2222-3333-4444-555555555555';
const USER = { authId: 'a', email: 'e@x.co', profile: { id: PROFILE_ID } };
const MB = 1024 * 1024;

const json = (body: unknown): Request =>
  new Request('http://localhost:3000/api/upload/video/x', { method: 'POST', body: JSON.stringify(body) });

async function sign(body: unknown): Promise<Response> {
  const { POST } = await import('@/app/api/upload/video/sign/route');
  return POST(json(body));
}
async function complete(body: unknown): Promise<Response> {
  const { POST } = await import('@/app/api/upload/video/complete/route');
  return POST(json(body));
}

const ftyp = (brand: string): Uint8Array =>
  new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, ...[...brand].map((c) => c.charCodeAt(0)), 0, 0, 0, 0]);

beforeEach(() => {
  for (const fn of Object.values(dbMock)) fn.mockReset();
  for (const fn of Object.values(storageMock)) fn.mockReset();
  getCurrentUserMock.mockReset();
  getCurrentUserMock.mockResolvedValue(USER);
  storageMock.deleteFile.mockResolvedValue(undefined);
});

describe('POST /api/upload/video/sign', () => {
  const ok = { fileName: 'edit.mp4', size: 20 * MB, type: 'video/mp4' };

  it('requires login', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    expect((await sign(ok)).status).toBe(401);
    expect(storageMock.createSignedUpload).not.toHaveBeenCalled();
  });

  it('rejects a malformed request', async () => {
    expect((await sign({ fileName: 'x.mp4' })).status).toBe(400);
    expect((await sign({ ...ok, size: -5 })).status).toBe(400);
  });

  it('rejects anything that is not MP4, WebM or MOV', async () => {
    const response = await sign({ fileName: 'film.avi', size: MB, type: 'video/x-msvideo' });

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('rejects a video over the size limit', async () => {
    const response = await sign({ ...ok, size: 51 * MB });

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('FILE_TOO_LARGE');
  });

  it('issues an upload in the signed-in person’s own folder, with the extension chosen by us', async () => {
    storageMock.createSignedUpload.mockImplementation(async (path: string) => ({ path, token: 'tok' }));

    // A crafted name cannot change where the file is stored.
    const response = await sign({ fileName: '../../evil.html.mp4', size: MB, type: 'video/mp4' });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.path).toMatch(new RegExp(`^${PROFILE_ID}/[A-Za-z0-9_-]+\\.mp4$`));
    expect(body.token).toBe('tok');
    expect(body.contentType).toBe('video/mp4');
  });

  it('uses the extension for .mov files that report no type', async () => {
    storageMock.createSignedUpload.mockImplementation(async (path: string) => ({ path, token: 'tok' }));

    const body = await (await sign({ fileName: 'clip.MOV', size: MB, type: '' })).json();

    expect(body.path.endsWith('.mov')).toBe(true);
    expect(body.contentType).toBe('video/quicktime');
  });

  it('reports a storage failure without leaking details', async () => {
    storageMock.createSignedUpload.mockRejectedValue(new Error('secret key rejected'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await sign(ok);

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('secret');
    spy.mockRestore();
  });
});

describe('POST /api/upload/video/complete', () => {
  const path = `${PROFILE_ID}/abcdefghij123.mp4`;
  const stored = { size: 5 * MB, contentType: 'video/mp4', publicUrl: `https://s.example/uploads/${path}` };

  function arrange(overrides: { stored?: object | null; head?: Uint8Array; existing?: object[] } = {}): void {
    dbMock.select.mockReturnValue(chainable(overrides.existing ?? []));
    dbMock.insert.mockReturnValue(chainable([{ id: 'file-1', publicUrl: stored.publicUrl, storagePath: path }]));
    storageMock.getStoredObject.mockResolvedValue(overrides.stored === undefined ? stored : overrides.stored);
    storageMock.readStoredHead.mockResolvedValue(overrides.head ?? ftyp('isom'));
  }

  it('requires login', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    expect((await complete({ path, fileName: 'a.mp4' })).status).toBe(401);
  });

  it('refuses paths that are not in the signed-in person’s own folder', async () => {
    arrange();

    for (const bad of [
      `99999999-2222-3333-4444-555555555555/abcdefghij123.mp4`,
      `${PROFILE_ID}/../other.mp4`,
      `${PROFILE_ID}/abcdefghij123.html`,
      'nonsense',
    ]) {
      expect((await complete({ path: bad, fileName: 'a.mp4' })).status).toBe(400);
    }
    expect(storageMock.getStoredObject).not.toHaveBeenCalled();
  });

  it('adds a verified video to the library', async () => {
    arrange();

    const response = await complete({ path, fileName: 'My edit.mp4' });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.url).toBe(stored.publicUrl);
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    expect(storageMock.deleteFile).not.toHaveBeenCalled();
  });

  it('is safe to call twice for the same upload', async () => {
    arrange({ existing: [{ id: 'file-1', publicUrl: stored.publicUrl }] });

    const response = await complete({ path, fileName: 'a.mp4' });

    expect(response.status).toBe(200);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it('says so when the upload never arrived', async () => {
    arrange({ stored: null });

    const response = await complete({ path, fileName: 'a.mp4' });

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('UPLOAD_MISSING');
  });

  it('accepts an .mp4 whose bytes carry the QuickTime brand (same container)', async () => {
    arrange({ head: ftyp('qt  ') });

    expect((await complete({ path, fileName: 'a.mp4' })).status).toBe(201);
  });

  it('deletes and refuses a file whose bytes are not a video, whatever it was named', async () => {
    arrange({ head: new TextEncoder().encode('<html><script>alert(1)</script></html>') });

    const response = await complete({ path, fileName: 'a.mp4' });

    expect(response.status).toBe(400);
    expect(storageMock.deleteFile).toHaveBeenCalledWith(path);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it('deletes and refuses a file stored with a content type that is not its own', async () => {
    arrange({ stored: { ...stored, contentType: 'text/html' } });

    const response = await complete({ path, fileName: 'a.mp4' });

    expect(response.status).toBe(400);
    expect(storageMock.deleteFile).toHaveBeenCalledWith(path);
  });

  it('deletes and refuses a file that is bigger than allowed', async () => {
    arrange({ stored: { ...stored, size: 80 * MB } });

    const response = await complete({ path, fileName: 'a.mp4' });

    expect((await response.json()).code).toBe('FILE_TOO_LARGE');
    expect(storageMock.deleteFile).toHaveBeenCalledWith(path);
  });

  it('refuses a WebM-named upload that holds MP4 data', async () => {
    const webmPath = `${PROFILE_ID}/abcdefghij123.webm`;
    arrange({ stored: { ...stored, contentType: 'video/webm' } });

    const response = await complete({ path: webmPath, fileName: 'a.webm' });

    expect(response.status).toBe(400);
    expect(storageMock.deleteFile).toHaveBeenCalledWith(webmPath);
  });
});
