import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { chainable, createDbMock } from '../helpers/db-mock';

const dbMock = createDbMock();
const getCurrentUserMock = vi.fn();

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: getCurrentUserMock }));

import { logActivity } from '@/lib/activity/log-activity';

const FOLDER_ID = '11111111-1111-4111-8111-111111111111';
const QR_ID = '22222222-2222-4222-8222-222222222222';
const MEMBER = { authId: 'a', email: 'm@memento.local', profile: { id: 'profile-1', role: 'member' } };
const ADMIN = { authId: 'b', email: 'boss@memento.local', profile: { id: 'profile-2', role: 'admin' } };

function json(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    ...(body !== undefined && { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  for (const fn of Object.values(dbMock)) fn.mockReset();
  getCurrentUserMock.mockReset();
  vi.mocked(logActivity).mockClear();
});

describe('/api/folders', () => {
  it('requires login for every method', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const list = await import('@/app/api/folders/route');
    const one = await import('@/app/api/folders/[id]/route');

    expect((await list.GET()).status).toBe(401);
    expect((await list.POST(json('/api/folders', 'POST', { name: 'A' }))).status).toBe(401);
    expect((await one.PUT(json('/x', 'PUT', { name: 'A' }), ctx(FOLDER_ID))).status).toBe(401);
    expect((await one.DELETE(json('/x', 'DELETE'), ctx(FOLDER_ID))).status).toBe(401);
  });

  it('lists the folders with their QR counts', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    dbMock.select.mockReturnValue(chainable([{ id: FOLDER_ID, name: 'Work', qrCount: 3 }]));
    const { GET } = await import('@/app/api/folders/route');

    const response = await GET();

    expect(await response.json()).toEqual({ items: [{ id: FOLDER_ID, name: 'Work', qrCount: 3 }] });
  });

  it('creates a folder and records it in the activity log', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    dbMock.select.mockReturnValue(chainable([]));
    dbMock.insert.mockReturnValue(chainable([{ id: FOLDER_ID, name: 'Work' }]));
    const { POST } = await import('@/app/api/folders/route');

    const response = await POST(json('/api/folders', 'POST', { name: '  Work  ' }));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id: FOLDER_ID, name: 'Work', qrCount: 0 });
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'folder.created', entityName: 'Work' }));
  });

  it('rejects an empty name', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    const { POST } = await import('@/app/api/folders/route');

    const response = await POST(json('/api/folders', 'POST', { name: '   ' }));

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('VALIDATION_ERROR');
  });

  it('rejects a duplicate name (case-insensitive)', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    dbMock.select.mockReturnValue(chainable([{ id: 'other' }]));
    const { POST } = await import('@/app/api/folders/route');

    const response = await POST(json('/api/folders', 'POST', { name: 'work' }));

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('FOLDER_EXISTS');
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it('renames only a folder the user owns', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    const { PUT } = await import('@/app/api/folders/[id]/route');

    dbMock.select.mockReturnValueOnce(chainable([]));
    expect((await PUT(json('/x', 'PUT', { name: 'New' }), ctx(FOLDER_ID))).status).toBe(404);

    dbMock.select
      .mockReturnValueOnce(chainable([{ id: FOLDER_ID, name: 'Old' }])) // owned
      .mockReturnValueOnce(chainable([])); // no duplicate
    dbMock.update.mockReturnValue(chainable([{ id: FOLDER_ID, name: 'New' }]));
    const ok = await PUT(json('/x', 'PUT', { name: 'New' }), ctx(FOLDER_ID));

    expect(ok.status).toBe(200);
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'folder.renamed', details: { from: 'Old' } }),
    );
  });

  it('refuses to rename onto an existing name', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    dbMock.select
      .mockReturnValueOnce(chainable([{ id: FOLDER_ID, name: 'Old' }]))
      .mockReturnValueOnce(chainable([{ id: 'taken' }]));
    const { PUT } = await import('@/app/api/folders/[id]/route');

    expect((await PUT(json('/x', 'PUT', { name: 'Taken' }), ctx(FOLDER_ID))).status).toBe(409);
  });

  it('deletes a folder without deleting its QR codes', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    dbMock.select.mockReturnValue(chainable([{ id: FOLDER_ID, name: 'Work' }]));
    dbMock.delete.mockReturnValue(chainable(undefined));
    const { DELETE } = await import('@/app/api/folders/[id]/route');

    const response = await DELETE(json('/x', 'DELETE'), ctx(FOLDER_ID));

    expect(response.status).toBe(204);
    expect(dbMock.delete).toHaveBeenCalledTimes(1); // only the folder row
    expect(dbMock.update).not.toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'folder.deleted' }));
  });

  it('404s when deleting someone else\'s or a missing folder', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    dbMock.select.mockReturnValue(chainable([]));
    const { DELETE } = await import('@/app/api/folders/[id]/route');

    expect((await DELETE(json('/x', 'DELETE'), ctx(FOLDER_ID))).status).toBe(404);
    expect(dbMock.delete).not.toHaveBeenCalled();
  });
});

describe('POST /api/qr/move', () => {
  it('requires login', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { POST } = await import('@/app/api/qr/move/route');

    expect((await POST(json('/api/qr/move', 'POST', { ids: [QR_ID], folderId: null }))).status).toBe(401);
  });

  it('rejects malformed requests', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    const { POST } = await import('@/app/api/qr/move/route');

    expect((await POST(json('/api/qr/move', 'POST', { ids: [], folderId: null }))).status).toBe(400);
    expect((await POST(json('/api/qr/move', 'POST', { ids: ['nope'], folderId: null }))).status).toBe(400);
  });

  it('will not move into a folder the user does not own', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    dbMock.select.mockReturnValue(chainable([]));
    const { POST } = await import('@/app/api/qr/move/route');

    const response = await POST(json('/api/qr/move', 'POST', { ids: [QR_ID], folderId: FOLDER_ID }));

    expect(response.status).toBe(404);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it('moves codes into a folder and reports how many', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    dbMock.select.mockReturnValue(chainable([{ id: FOLDER_ID, name: 'Work' }]));
    dbMock.update.mockReturnValue(chainable([{ id: QR_ID }]));
    const { POST } = await import('@/app/api/qr/move/route');

    const response = await POST(json('/api/qr/move', 'POST', { ids: [QR_ID], folderId: FOLDER_ID }));

    expect(await response.json()).toEqual({ moved: 1 });
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'qr.moved', details: { count: 1 } }));
  });

  it('moves codes out of any folder with a null folder', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    dbMock.update.mockReturnValue(chainable([{ id: QR_ID }]));
    const { POST } = await import('@/app/api/qr/move/route');

    const response = await POST(json('/api/qr/move', 'POST', { ids: [QR_ID], folderId: null }));

    expect(response.status).toBe(200);
    expect(dbMock.select).not.toHaveBeenCalled();
  });
});

describe('POST /api/qr with a folder', () => {
  const body = {
    name: 'Menu',
    qrType: 'url',
    payload: 'https://example.com',
    styleConfig: {},
    folderId: FOLDER_ID,
  };

  it('rejects a folder the user does not own', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    dbMock.select.mockReturnValue(chainable([]));
    const { POST } = await import('@/app/api/qr/route');

    expect((await POST(json('/api/qr', 'POST', body))).status).toBe(404);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it('files the new code in the folder and logs it', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    dbMock.select.mockReturnValue(chainable([{ id: FOLDER_ID }]));
    const values = vi.fn(() => chainable([{ id: QR_ID, name: 'Menu', qrType: 'url' }]));
    dbMock.insert.mockReturnValue({ values });
    const { POST } = await import('@/app/api/qr/route');

    const response = await POST(json('/api/qr', 'POST', body));

    expect(response.status).toBe(201);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ folderId: FOLDER_ID }));
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'qr.created' }));
  });
});

describe('POST /api/qr/batch', () => {
  const item = (over: Record<string, unknown> = {}) => ({
    name: 'Site',
    qrType: 'url',
    content: 'example.com',
    isDynamic: false,
    tags: [],
    ...over,
  });
  const post = (payload: unknown) => json('/api/qr/batch', 'POST', payload);

  it('requires login', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { POST } = await import('@/app/api/qr/batch/route');

    expect((await POST(post({ items: [item()], styleConfig: {} }))).status).toBe(401);
  });

  it('rejects an empty list and oversized lists', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    const { POST } = await import('@/app/api/qr/batch/route');

    expect((await POST(post({ items: [], styleConfig: {} }))).status).toBe(400);
    expect((await POST(post({ items: Array.from({ length: 201 }, () => item()), styleConfig: {} }))).status).toBe(400);
  });

  it('re-validates rows on the server and names the bad row', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    const { POST } = await import('@/app/api/qr/batch/route');

    const response = await POST(post({ items: [item(), item({ content: 'not a url' })], styleConfig: {} }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('INVALID_ROWS');
    expect(body.error).toContain('Row 2');
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it('rejects an unsupported type', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    const { POST } = await import('@/app/api/qr/batch/route');

    expect((await POST(post({ items: [item({ qrType: 'wifi' })], styleConfig: {} }))).status).toBe(400);
  });

  it('will not file codes in a folder the user does not own', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    dbMock.select.mockReturnValue(chainable([]));
    const { POST } = await import('@/app/api/qr/batch/route');

    const response = await POST(post({ items: [item()], styleConfig: {}, folderId: FOLDER_ID }));

    expect(response.status).toBe(404);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it('creates static and dynamic codes in one insert', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    dbMock.select.mockReturnValue(chainable([{ id: FOLDER_ID }]));
    const values = vi.fn(() => chainable([{ id: 'a' }, { id: 'b' }]));
    dbMock.insert.mockReturnValue({ values });
    const { POST } = await import('@/app/api/qr/batch/route');

    const response = await POST(
      post({
        items: [item({ name: 'Static' }), item({ name: 'Live', isDynamic: true, tags: ['x'] })],
        styleConfig: { dotColor: '#000000' },
        folderId: FOLDER_ID,
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ created: 2 });
    expect(dbMock.insert).toHaveBeenCalledTimes(1);

    const [rows] = values.mock.calls[0] as unknown as [Record<string, unknown>[]];
    expect(rows[0]).toMatchObject({
      name: 'Static',
      payload: 'https://example.com',
      isDynamic: false,
      shortCode: null,
      targetUrl: null,
      folderId: FOLDER_ID,
      userId: 'profile-1',
      styleConfig: { dotColor: '#000000' },
    });
    expect(rows[1].isDynamic).toBe(true);
    expect(rows[1].shortCode).toMatch(/^[2-9a-hj-km-np-z]{6}$/);
    expect(rows[1].payload).toContain(`/q/${rows[1].shortCode as string}`);
    expect(rows[1].targetUrl).toBe('https://example.com');
    expect(rows[1].tags).toEqual(['x']);
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'qr.batch_created', details: { count: 2, dynamic: 1 } }),
    );
  });

  it('gives every dynamic code its own short link', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    const values = vi.fn(() => chainable([{ id: 'a' }, { id: 'b' }, { id: 'c' }]));
    dbMock.insert.mockReturnValue({ values });
    const { POST } = await import('@/app/api/qr/batch/route');

    await POST(post({ items: [1, 2, 3].map(() => item({ isDynamic: true })), styleConfig: {} }));

    const [rows] = values.mock.calls[0] as unknown as [{ shortCode: string }[]];
    expect(new Set(rows.map((row) => row.shortCode)).size).toBe(3);
  });
});

describe('POST /api/qr/[id]/duplicate', () => {
  const source = {
    id: QR_ID,
    name: 'Menu',
    qrType: 'url',
    payload: 'https://example.com',
    payloadFields: { url: 'example.com' },
    isDynamic: false,
    shortCode: null,
    targetUrl: null,
    styleConfig: { dotColor: '#111111' },
    templateId: null,
    folderId: FOLDER_ID,
    expiresAt: null,
    scanLimit: null,
    tags: ['a'],
    notes: null,
  };

  it('requires login and an existing code', async () => {
    const { POST } = await import('@/app/api/qr/[id]/duplicate/route');

    getCurrentUserMock.mockResolvedValue(null);
    expect((await POST(json('/x', 'POST'), ctx(QR_ID))).status).toBe(401);

    getCurrentUserMock.mockResolvedValue(MEMBER);
    dbMock.select.mockReturnValue(chainable([]));
    expect((await POST(json('/x', 'POST'), ctx(QR_ID))).status).toBe(404);
  });

  it('copies a static code with a "(copy)" name and the same style', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    dbMock.select.mockReturnValue(chainable([source]));
    const values = vi.fn(() => chainable([{ id: 'new', name: 'Menu (copy)' }]));
    dbMock.insert.mockReturnValue({ values });
    const { POST } = await import('@/app/api/qr/[id]/duplicate/route');

    const response = await POST(json('/x', 'POST'), ctx(QR_ID));

    expect(response.status).toBe(201);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Menu (copy)',
        payload: 'https://example.com',
        styleConfig: { dotColor: '#111111' },
        folderId: FOLDER_ID,
        shortCode: null,
      }),
    );
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'qr.duplicated' }));
  });

  it('gives a dynamic copy its own short link and the same destination', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    dbMock.select.mockReturnValue(
      chainable([{ ...source, isDynamic: true, shortCode: 'abc234', targetUrl: 'https://dest.example', payload: 'http://localhost:3000/q/abc234' }]),
    );
    const values = vi.fn(() => chainable([{ id: 'new', name: 'Menu (copy)' }]));
    dbMock.insert.mockReturnValue({ values });
    const { POST } = await import('@/app/api/qr/[id]/duplicate/route');

    await POST(json('/x', 'POST'), ctx(QR_ID));

    const [row] = values.mock.calls[0] as unknown as [{ shortCode: string; payload: string; targetUrl: string }];
    expect(row.shortCode).not.toBe('abc234');
    expect(row.payload).toContain(`/q/${row.shortCode}`);
    expect(row.targetUrl).toBe('https://dest.example');
  });
});

describe('GET /api/export', () => {
  function selectsFor(qrRows: unknown[]) {
    dbMock.select
      .mockReturnValueOnce(chainable([{ id: FOLDER_ID }])) // folders
      .mockReturnValueOnce(chainable(qrRows)) // qr codes
      .mockReturnValueOnce(chainable([])) // qr templates
      .mockReturnValueOnce(chainable([{ id: 'p1' }])) // pages
      .mockReturnValueOnce(chainable([{ id: 'act' }])); // activity
  }

  it('requires login', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { GET } = await import('@/app/api/export/route');

    expect((await GET(json('/api/export', 'GET'))).status).toBe(401);
  });

  it('only lets admins export the whole team', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    const { GET } = await import('@/app/api/export/route');

    const response = await GET(json('/api/export?scope=team', 'GET'));

    expect(response.status).toBe(403);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('downloads a JSON backup with a dated filename and counts', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    selectsFor([{ id: QR_ID }]);
    dbMock.select.mockReturnValueOnce(chainable([{ id: 's1' }, { id: 's2' }])); // scans
    const { GET } = await import('@/app/api/export/route');

    const response = await GET(json('/api/export', 'GET'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toMatch(/attachment; filename="memento-qr-backup-\d{4}-\d{2}-\d{2}\.json"/);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const backup = await response.json();
    expect(backup).toMatchObject({
      app: 'memento-qr',
      scope: 'mine',
      exportedBy: 'm@memento.local',
      counts: { folders: 1, qrCodes: 1, qrTemplates: 0, pages: 1, scanEvents: 2, activity: 1 },
    });
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'data.exported' }));
  });

  it('skips the scan query when there are no QR codes', async () => {
    getCurrentUserMock.mockResolvedValue(MEMBER);
    selectsFor([]);
    const { GET } = await import('@/app/api/export/route');

    const backup = await (await GET(json('/api/export', 'GET'))).json();

    expect(dbMock.select).toHaveBeenCalledTimes(5);
    expect(backup.counts.scanEvents).toBe(0);
  });

  it('lets an admin export the whole team', async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN);
    selectsFor([]);
    const { GET } = await import('@/app/api/export/route');

    const response = await GET(json('/api/export?scope=team', 'GET'));

    expect(response.status).toBe(200);
    expect((await response.json()).scope).toBe('team');
  });
});
