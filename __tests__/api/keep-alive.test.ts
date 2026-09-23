import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const dbMock = { execute: vi.fn() };
vi.mock('@/lib/db', () => ({ db: dbMock }));

const call = async (authorization?: string): Promise<Response> => {
  const { GET } = await import('@/app/api/cron/keep-alive/route');
  return GET(new Request('http://localhost:3000/api/cron/keep-alive', authorization ? { headers: { authorization } } : undefined));
};

describe('GET /api/cron/keep-alive', () => {
  beforeEach(() => {
    dbMock.execute.mockReset().mockResolvedValue([{ '?column?': 1 }]);
    vi.stubEnv('CRON_SECRET', 'a-long-random-secret');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('runs one tiny query for a caller with the right secret', async () => {
    const response = await call('Bearer a-long-random-secret');

    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
    expect(dbMock.execute).toHaveBeenCalledTimes(1);
  });

  it.each([[undefined], ['Bearer wrong'], ['Bearer '], ['a-long-random-secret'], ['Basic a-long-random-secret'], ['Bearer a-long-random-secret-extra']])(
    'refuses %j without touching the database',
    async (header) => {
      const response = await call(header);

      expect(response.status).toBe(401);
      expect(dbMock.execute).not.toHaveBeenCalled();
    },
  );

  it('refuses everyone when no secret is configured (never falls open)', async () => {
    vi.stubEnv('CRON_SECRET', '');

    expect((await call('Bearer ')).status).toBe(503);
    expect((await call()).status).toBe(503);
    expect(dbMock.execute).not.toHaveBeenCalled();
  });

  it('reports a database failure as a 500 so the cron shows red', async () => {
    dbMock.execute.mockRejectedValue(new Error('down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await call('Bearer a-long-random-secret');

    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe('DB_UNREACHABLE');
    spy.mockRestore();
  });
});
