import { describe, it, expect, vi, beforeEach } from 'vitest';

const getCurrentUserMock = vi.fn();
const restoreMock = vi.fn();
const logActivityMock = vi.fn();

vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock('@/lib/export/restore-backup', () => ({ restoreBackup: restoreMock }));
vi.mock('@/lib/activity/log-activity', () => ({ logActivity: logActivityMock }));

const USER = { authId: 'a', email: 'e@x.co', profile: { id: 'profile-1' } };
const SUMMARY = {
  added: { folders: 0, qrCodes: 1, qrTemplates: 0, pages: 0 },
  skipped: { folders: 0, qrCodes: 0, qrTemplates: 0, pages: 0 },
  invalid: 0,
};

async function post(body: string): Promise<Response> {
  const { POST } = await import('@/app/api/import/route');
  return POST(new Request('http://localhost:3000/api/import', { method: 'POST', body }));
}

const backup = JSON.stringify({
  app: 'memento-qr',
  formatVersion: 1,
  qrCodes: [{ name: 'Menu', qrType: 'url', payload: 'https://example.com', styleConfig: {} }],
});

describe('POST /api/import', () => {
  beforeEach(() => {
    for (const fn of [getCurrentUserMock, restoreMock, logActivityMock]) fn.mockReset();
    getCurrentUserMock.mockResolvedValue(USER);
    restoreMock.mockResolvedValue(SUMMARY);
  });

  it('requires login', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    expect((await post(backup)).status).toBe(401);
    expect(restoreMock).not.toHaveBeenCalled();
  });

  it('rejects text that is not JSON', async () => {
    expect((await post('not json')).status).toBe(400);
  });

  it('rejects JSON that is not a Memento QR backup', async () => {
    const response = await post(JSON.stringify({ hello: 'world' }));

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('VALIDATION_ERROR');
    expect(restoreMock).not.toHaveBeenCalled();
  });

  it('restores into the signed-in user and logs it', async () => {
    const response = await post(backup);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(SUMMARY);
    expect(restoreMock).toHaveBeenCalledWith('profile-1', expect.objectContaining({ qrCodes: expect.any(Array) }));
    expect(logActivityMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'data.imported', userId: 'profile-1' }));
  });

  it('reports a failed restore without leaking details', async () => {
    restoreMock.mockRejectedValue(new Error('db exploded'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await post(backup);

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('exploded');
    spy.mockRestore();
  });
});
