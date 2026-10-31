import { describe, it, expect, vi, beforeEach } from 'vitest';

import { chainable, createDbMock } from '../helpers/db-mock';

const dbMock = createDbMock();
const getCurrentUserMock = vi.fn();
const logActivityMock = vi.fn();

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock('@/lib/activity/log-activity', () => ({ logActivity: logActivityMock }));

const AUTHED_USER = { authId: 'auth-1', email: 'test@memento.local', profile: { id: 'profile-1' } };
const UUID = '11111111-1111-4111-8111-111111111111';

const SNAPSHOT_OLD = {
  name: 'Memorial',
  qrType: 'url',
  payload: 'http://localhost:3000/q/abc123',
  targetUrl: 'https://canva.example/old',
  payloadFields: { url: 'https://canva.example/old' },
  styleConfig: { dotColor: '#000000' },
  isPaused: false,
  expiresAt: null,
  scanLimit: null,
  tags: null,
  notes: null,
  folderId: null,
};

const QR = {
  id: 'qr-1',
  ...SNAPSHOT_OLD,
  qrType: 'video',
  targetUrl: 'http://localhost:3000/media/p/new.mp4',
  payloadFields: { videoUrl: 'x' },
  isDynamic: true,
  shortCode: 'abc123',
  createdAt: new Date('2026-01-01'),
};

describe('GET /api/qr/[id]/versions', () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    getCurrentUserMock.mockReset();
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
  });

  async function call(): Promise<Response> {
    const { GET } = await import('@/app/api/qr/[id]/versions/route');
    return GET(new Request('http://localhost:3000/api/qr/qr-1/versions'), { params: Promise.resolve({ id: 'qr-1' }) });
  }

  it('requires login', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it('404s for a missing code', async () => {
    dbMock.select.mockReturnValueOnce(chainable([]));
    expect((await call()).status).toBe(404);
  });

  it('numbers the versions oldest = 1 and marks the newest as current', async () => {
    dbMock.select.mockReturnValueOnce(chainable([{ id: 'qr-1' }])).mockReturnValueOnce(
      chainable([
        { id: 'v2', snapshot: { ...SNAPSHOT_OLD, qrType: 'video', targetUrl: 'http://x/new.mp4' }, summary: 'Changed type', restoredFromId: null, createdAt: new Date(), fullName: 'Maria Santos', email: 'm@x.co' },
        { id: 'v1', snapshot: SNAPSHOT_OLD, summary: 'Original version', restoredFromId: null, createdAt: new Date(), fullName: null, email: null },
      ]),
    );

    const body = await (await call()).json();

    expect(body.versions.map((v: { number: number; isCurrent: boolean }) => [v.number, v.isCurrent])).toEqual([
      [2, true],
      [1, false],
    ]);
    expect(body.versions[0]).toMatchObject({ qrType: 'video', destination: 'http://x/new.mp4', changedBy: 'Maria Santos' });
    expect(body.versions[1].changedBy).toBeNull();
  });
});

describe('POST /api/qr/[id]/versions/[versionId]/restore', () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    dbMock.update.mockReset();
    dbMock.insert.mockReset();
    getCurrentUserMock.mockReset();
    logActivityMock.mockReset();
    getCurrentUserMock.mockResolvedValue(AUTHED_USER);
  });

  async function call(versionId = UUID): Promise<Response> {
    const { POST } = await import('@/app/api/qr/[id]/versions/[versionId]/restore/route');
    return POST(new Request('http://localhost:3000/x', { method: 'POST' }), {
      params: Promise.resolve({ id: 'qr-1', versionId }),
    });
  }

  function stubUpdate(): { captured: () => Record<string, unknown> } {
    let captured: Record<string, unknown> = {};
    dbMock.update.mockReturnValue({
      set: (values: Record<string, unknown>) => {
        captured = values;
        return chainable([{ ...QR, ...values }]);
      },
    });
    return { captured: () => captured };
  }

  const VERSION = { id: UUID, qrCodeId: 'qr-1', snapshot: SNAPSHOT_OLD, createdAt: new Date('2026-02-01') };

  it('requires login', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it('rejects a version id that is not a uuid', async () => {
    expect((await call('nope')).status).toBe(400);
  });

  it('404s for a missing code or a version that is not this code\'s', async () => {
    dbMock.select.mockReturnValueOnce(chainable([]));
    expect((await call()).status).toBe(404);

    dbMock.select.mockReturnValueOnce(chainable([QR])).mockReturnValueOnce(chainable([]));
    const response = await call();
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe('VERSION_NOT_FOUND');
  });

  it('refuses to "restore" what is already current', async () => {
    dbMock.select
      .mockReturnValueOnce(chainable([QR]))
      .mockReturnValueOnce(chainable([{ ...VERSION, snapshot: { ...SNAPSHOT_OLD, qrType: 'video', targetUrl: QR.targetUrl, payloadFields: QR.payloadFields } }]));

    const response = await call();

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('ALREADY_CURRENT');
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it('refuses to put a video version on a static code', async () => {
    dbMock.select
      .mockReturnValueOnce(chainable([{ ...QR, isDynamic: false, qrType: 'url' }]))
      .mockReturnValueOnce(chainable([{ ...VERSION, snapshot: { ...SNAPSHOT_OLD, qrType: 'video' } }]));

    const response = await call();

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('STATIC_CANNOT_CHANGE_TYPE');
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it('restores a dynamic code without touching its link, and records the restore as a new version', async () => {
    dbMock.select.mockReturnValueOnce(chainable([QR])).mockReturnValueOnce(chainable([VERSION]));
    const inserts: Record<string, unknown>[] = [];
    dbMock.insert.mockReturnValue({
      values: (v: Record<string, unknown>) => {
        inserts.push(v);
        return Promise.resolve();
      },
    });
    const state = stubUpdate();

    const response = await call();

    expect(response.status).toBe(200);
    expect(state.captured()).toMatchObject({
      qrType: 'url',
      targetUrl: 'https://canva.example/old',
      updatedBy: 'profile-1',
      healthStatus: null,
    });
    expect(state.captured()).not.toHaveProperty('shortCode');
    expect(state.captured()).not.toHaveProperty('payload');
    expect(state.captured()).not.toHaveProperty('isDynamic');
    expect(inserts.find((v) => 'summary' in v && v.restoredFromId === UUID)).toBeDefined();
    expect(inserts.find((v) => 'previousQrType' in v)).toMatchObject({ qrType: 'url', previousQrType: 'video' });
    expect(logActivityMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'qr.version_restored' }));
  });

  it('restores the content of a static code', async () => {
    dbMock.select
      .mockReturnValueOnce(chainable([{ ...QR, isDynamic: false, qrType: 'url', payload: 'https://new.example' }]))
      .mockReturnValueOnce(chainable([{ ...VERSION, snapshot: { ...SNAPSHOT_OLD, payload: 'https://old.example' } }]));
    dbMock.insert.mockReturnValue({ values: () => Promise.resolve() });
    const state = stubUpdate();

    expect((await call()).status).toBe(200);
    expect(state.captured()).toMatchObject({ payload: 'https://old.example' });
  });
});
