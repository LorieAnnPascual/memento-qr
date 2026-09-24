import { describe, it, expect, vi, beforeEach } from 'vitest';

import { chainable, createDbMock } from '../helpers/db-mock';

const dbMock = createDbMock();
const getCurrentUserMock = vi.fn();
const deleteFileMock = vi.fn();
const clearMock = vi.fn();

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock('@/lib/storage', () => ({ deleteFile: deleteFileMock }));
vi.mock('@/lib/qr/clear-media-references', () => ({ clearMediaReferences: clearMock }));

const USER = { authId: 'a', email: 'e@x.co', profile: { id: 'profile-1' } };
const ctx = { params: Promise.resolve({ id: 'file-1' }) };
const del = async (): Promise<Response> => {
  const { DELETE } = await import('@/app/api/upload/[id]/route');
  return DELETE(new Request('http://localhost:3000/api/upload/file-1', { method: 'DELETE' }), ctx);
};

describe('DELETE /api/upload/[id]', () => {
  beforeEach(() => {
    for (const fn of Object.values(dbMock)) fn.mockReset();
    for (const fn of [getCurrentUserMock, deleteFileMock, clearMock]) fn.mockReset();
    getCurrentUserMock.mockResolvedValue(USER);
  });

  it('requires login', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    expect((await del()).status).toBe(401);
  });

  it('404s for a file that does not exist', async () => {
    dbMock.select.mockReturnValue(chainable([]));

    expect((await del()).status).toBe(404);
    expect(deleteFileMock).not.toHaveBeenCalled();
  });

  it('removes the stored file, clears references to it, and deletes the record', async () => {
    dbMock.select.mockReturnValue(chainable([{ id: 'file-1', storagePath: 'profile-1/a.png', publicUrl: 'https://s.example/a.png' }]));
    dbMock.delete.mockReturnValue(chainable(undefined));

    const response = await del();

    expect(response.status).toBe(204);
    expect(deleteFileMock).toHaveBeenCalledWith('profile-1/a.png');
    expect(clearMock).toHaveBeenCalledWith('https://s.example/a.png');
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
  });

  it('keeps the record when storage deletion fails', async () => {
    dbMock.select.mockReturnValue(chainable([{ id: 'file-1', storagePath: 'p/a.png', publicUrl: 'u' }]));
    deleteFileMock.mockRejectedValue(new Error('storage down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await del();

    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe('DELETE_FAILED');
    expect(dbMock.delete).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
