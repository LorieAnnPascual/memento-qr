import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { renderToStaticMarkup } from 'react-dom/server';

import { chainable, createDbMock } from '../helpers/db-mock';

const dbMock = createDbMock();
const getCurrentUserMock = vi.fn();
const logScanEventMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock('@/lib/analytics/scan-logger', () => ({ logScanEvent: logScanEventMock }));
// Stand-ins that say which kind of redirect (or not-found) the page asked for.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT 307 ${url}`);
  },
  permanentRedirect: (url: string) => {
    throw new Error(`REDIRECT 308 ${url}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

const USER = { authId: 'auth-1', email: 't@memento.local', profile: { id: 'profile-1' } };

const LIVE_QR = { id: 'qr-1', name: 'Samsam memorial', shortCode: 'samsam-memorial', isDynamic: true };
const params = Promise.resolve({ id: 'qr-1' });
const pageParams = Promise.resolve({ id: 'page-1' });

/** Rows `getSlugState` reads: "is it anyone's current link?", then "is it an old or forwarded name?". */
function state(current: object[], alias: object[] = []): void {
  dbMock.select.mockReturnValueOnce(chainable(current)).mockReturnValueOnce(chainable(alias));
}

function captureWrites() {
  const writes = { inserts: [] as Record<string, unknown>[], updates: [] as Record<string, unknown>[], deletes: 0 };
  dbMock.insert.mockReturnValue({
    values: (values: Record<string, unknown>) => {
      writes.inserts.push(values);
      return chainable([{ id: 'new-1', ...values }]);
    },
  });
  dbMock.update.mockReturnValue({
    set: (values: Record<string, unknown>) => {
      writes.updates.push(values);
      return chainable([{ id: 'qr-1', name: 'Menu', ...values }]);
    },
  });
  dbMock.delete.mockImplementation(() => {
    writes.deletes += 1;
    return chainable([{ code: 'samsam' }]);
  });
  dbMock.transaction.mockImplementation(async (callback: (tx: typeof dbMock) => unknown) => callback(dbMock));
  return writes;
}

beforeEach(() => {
  for (const fn of Object.values(dbMock)) fn.mockReset();
  getCurrentUserMock.mockReset();
  getCurrentUserMock.mockResolvedValue(USER);
  logScanEventMock.mockClear();
});

describe('/api/qr/[id]/forwards', () => {
  const call = async (method: 'GET' | 'POST' | 'DELETE', body?: unknown, query = '') => {
    const route = await import('@/app/api/qr/[id]/forwards/route');
    return route[method](
      new NextRequest(`http://localhost:3000/api/qr/qr-1/forwards${query}`, {
        method,
        ...(body !== undefined && { body: JSON.stringify(body) }),
      }),
      { params },
    );
  };

  it('needs a login', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    expect((await call('GET')).status).toBe(401);
    expect((await call('POST', { slug: 'samsam' })).status).toBe(401);
    expect((await call('DELETE', undefined, '?code=samsam')).status).toBe(401);
  });

  it('404s for a code that does not exist', async () => {
    dbMock.select.mockReturnValueOnce(chainable([]));

    expect((await call('GET')).status).toBe(404);
  });

  it('lists the old links forwarded to a code', async () => {
    dbMock.select
      .mockReturnValueOnce(chainable([LIVE_QR]))
      .mockReturnValueOnce(chainable([{ code: 'samsam', createdAt: new Date() }]));

    const body = await (await call('GET')).json();

    expect(body.forwards).toEqual([expect.objectContaining({ code: 'samsam' })]);
  });

  it('forwards a free old link to the code', async () => {
    dbMock.select
      .mockReturnValueOnce(chainable([LIVE_QR])) // the code
      .mockReturnValueOnce(chainable([])) // not anyone's link
      .mockReturnValueOnce(chainable([])) // not an old name
      .mockReturnValueOnce(chainable([{ code: 'samsam', createdAt: new Date() }])); // the refreshed list
    const writes = captureWrites();

    const response = await call('POST', { slug: 'Samsam' });

    expect(response.status).toBe(201);
    expect(writes.inserts[0]).toEqual({ kind: 'qr', code: 'samsam', redirect: true, qrCodeId: 'qr-1' });
    expect((await response.json()).forwards).toHaveLength(1);
  });

  it('refuses a link that is in use, including this code’s own (409)', async () => {
    dbMock.select.mockReturnValueOnce(chainable([LIVE_QR]));
    state([{ id: 'qr-1', deletedAt: null }]); // the code's own current link counts as in use
    const writes = captureWrites();

    const response = await call('POST', { slug: 'samsam-memorial' });

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('SLUG_TAKEN');
    expect(writes.inserts).toHaveLength(0);
  });

  it('asks for a confirmation before taking over a deleted code’s link (409 SLUG_DELETED)', async () => {
    dbMock.select.mockReturnValueOnce(chainable([LIVE_QR]));
    state([{ id: 'gone', deletedAt: new Date() }]);
    const writes = captureWrites();

    const response = await call('POST', { slug: 'samsam' });

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('SLUG_DELETED');
    expect(writes.inserts).toHaveLength(0);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it('takes over a deleted code’s link once confirmed: the deleted code loses it, then it forwards here', async () => {
    dbMock.select
      .mockReturnValueOnce(chainable([LIVE_QR]))
      .mockReturnValueOnce(chainable([{ id: 'gone', deletedAt: new Date() }]))
      .mockReturnValueOnce(chainable([]))
      .mockReturnValueOnce(chainable([{ code: 'samsam', createdAt: new Date() }]));
    const writes = captureWrites();

    const response = await call('POST', { slug: 'samsam', reclaimDeletedLink: true });

    expect(response.status).toBe(201);
    expect(writes.updates[0]).toEqual({ shortCode: null }); // released from the deleted code
    expect(writes.inserts[0]).toMatchObject({ code: 'samsam', redirect: true, qrCodeId: 'qr-1' });
  });

  it('needs the code to have a link of its own to forward to (400 NO_LINK)', async () => {
    dbMock.select.mockReturnValueOnce(chainable([{ ...LIVE_QR, isDynamic: false, shortCode: null }]));

    const response = await call('POST', { slug: 'samsam' });

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('NO_LINK');
  });

  it('refuses names that are not allowed (400)', async () => {
    dbMock.select.mockReturnValue(chainable([LIVE_QR]));
    captureWrites();

    expect((await call('POST', { slug: 'ab' })).status).toBe(400);
    expect((await call('POST', { slug: '   ' })).status).toBe(400);
    expect((await call('POST', {})).status).toBe(400);
  });

  it('stops forwarding a link', async () => {
    dbMock.select
      .mockReturnValueOnce(chainable([LIVE_QR]))
      .mockReturnValueOnce(chainable([]));
    captureWrites();

    const response = await call('DELETE', undefined, '?code=SamSam');

    expect(response.status).toBe(200);
    expect((await response.json()).removed).toBe('samsam');
  });

  it('404s when asked to stop a link that is not forwarded here', async () => {
    dbMock.select.mockReturnValueOnce(chainable([LIVE_QR]));
    dbMock.delete.mockReturnValue(chainable([]));

    expect((await call('DELETE', undefined, '?code=other')).status).toBe(404);
  });
});

describe('/api/pages/[id]/forwards', () => {
  const PAGE = { id: 'page-1', name: 'Ana', isSystem: false, shortCode: 'ana-memorial' };
  const call = async (method: 'GET' | 'POST' | 'DELETE', body?: unknown, query = '') => {
    const route = await import('@/app/api/pages/[id]/forwards/route');
    return route[method](
      new NextRequest(`http://localhost:3000/api/pages/page-1/forwards${query}`, {
        method,
        ...(body !== undefined && { body: JSON.stringify(body) }),
      }),
      { params: pageParams },
    );
  };

  it('forwards a free old link to a published page', async () => {
    dbMock.select
      .mockReturnValueOnce(chainable([PAGE]))
      .mockReturnValueOnce(chainable([]))
      .mockReturnValueOnce(chainable([]))
      .mockReturnValueOnce(chainable([{ code: 'old-page', createdAt: new Date() }]));
    const writes = captureWrites();

    const response = await call('POST', { slug: 'old-page' });

    expect(response.status).toBe(201);
    expect(writes.inserts[0]).toEqual({ kind: 'page', code: 'old-page', redirect: true, pageId: 'page-1' });
  });

  it('needs the page to have been published once (400 NO_LINK)', async () => {
    dbMock.select.mockReturnValueOnce(chainable([{ ...PAGE, shortCode: null }]));

    expect((await call('POST', { slug: 'old-page' })).status).toBe(400);
  });

  it('refuses a name another page uses (409) and never touches built-in templates (403)', async () => {
    dbMock.select.mockReturnValueOnce(chainable([PAGE]));
    state([{ id: 'other-page' }]);
    expect((await call('POST', { slug: 'taken-name' })).status).toBe(409);

    dbMock.select.mockReset();
    dbMock.select.mockReturnValueOnce(chainable([{ ...PAGE, isSystem: true }]));
    expect((await call('POST', { slug: 'any-name' })).status).toBe(403);
  });

  it('stops forwarding a link', async () => {
    dbMock.select.mockReturnValueOnce(chainable([PAGE])).mockReturnValueOnce(chainable([]));
    captureWrites();

    expect((await call('DELETE', undefined, '?code=old-page')).status).toBe(200);
  });

  it('needs a login', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    expect((await call('POST', { slug: 'old-page' })).status).toBe(401);
  });
});

describe('creating or editing a code with a deleted code’s link', () => {
  const body = { name: 'Samsam', qrType: 'url', payload: 'https://example.com', styleConfig: {}, isDynamic: true, slug: 'samsam' };

  it('POST asks for a confirmation first (409 SLUG_DELETED) and writes nothing', async () => {
    state([{ id: 'gone', deletedAt: new Date() }]);
    const writes = captureWrites();
    const { POST } = await import('@/app/api/qr/route');

    const response = await POST(new NextRequest('http://localhost:3000/api/qr', { method: 'POST', body: JSON.stringify(body) }));

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('SLUG_DELETED');
    expect(writes.inserts).toHaveLength(0);
  });

  it('POST reuses the link once confirmed: the deleted code loses it, the new code gets it', async () => {
    state([{ id: 'gone', deletedAt: new Date() }]);
    const writes = captureWrites();
    const { POST } = await import('@/app/api/qr/route');

    const response = await POST(
      new NextRequest('http://localhost:3000/api/qr', { method: 'POST', body: JSON.stringify({ ...body, reclaimDeletedLink: true }) }),
    );

    expect(response.status).toBe(201);
    expect(writes.updates[0]).toEqual({ shortCode: null });
    expect(writes.inserts[0]).toMatchObject({ shortCode: 'samsam' });
  });

  it('PUT (renaming a code to a deleted code’s link) needs the same confirmation', async () => {
    const existing = { id: 'qr-1', name: 'Menu', isDynamic: true, shortCode: 'menu1', targetUrl: 'https://e.com', payload: 'https://app/q/menu1', qrType: 'url', deletedAt: null };
    const { PUT } = await import('@/app/api/qr/[id]/route');
    const put = (data: object) =>
      PUT(new NextRequest('http://localhost:3000/api/qr/qr-1', { method: 'PUT', body: JSON.stringify(data) }), { params });

    dbMock.select.mockReturnValueOnce(chainable([existing]));
    state([{ id: 'gone', deletedAt: new Date() }]);
    captureWrites();
    expect((await put({ isDynamic: true, slug: 'samsam', payload: 'https://e.com' })).status).toBe(409);

    dbMock.select.mockReset();
    dbMock.select.mockReturnValueOnce(chainable([existing]));
    state([{ id: 'gone', deletedAt: new Date() }]);
    const writes = captureWrites();
    const confirmed = await put({ isDynamic: true, slug: 'samsam', payload: 'https://e.com', reclaimDeletedLink: true });

    expect(confirmed.status).toBe(200);
    expect(writes.updates[0]).toEqual({ shortCode: null }); // released from the deleted code
    expect(writes.updates.some((values) => values.shortCode === 'samsam')).toBe(true);
  });
});

describe('/q/[code] for an old link forwarded to another code', () => {
  const scan = async (code = 'samsam') => {
    const { GET } = await import('@/app/q/[shortCode]/route');
    return GET(new Request(`https://memento-qr.vercel.app/q/${code}`), { params: Promise.resolve({ shortCode: code }) });
  };
  /** No code has this name now, and it is a forward to qr-1. */
  function forwarded(): void {
    dbMock.update.mockReturnValueOnce(chainable([]));
    dbMock.select.mockReturnValueOnce(chainable([{ qrCodeId: 'qr-1', pageId: null, redirect: true }]));
  }

  it('answers a permanent redirect (301) to the code’s current link, remembered for at most a day', async () => {
    forwarded();
    dbMock.select.mockReturnValueOnce(chainable([{ shortCode: 'samsam-memorial', deletedAt: null }]));

    const response = await scan();

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://memento-qr.vercel.app/q/samsam-memorial');
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400');
  });

  it('does not count a scan itself; the code it lands on counts it', async () => {
    forwarded();
    dbMock.select.mockReturnValueOnce(chainable([{ shortCode: 'samsam-memorial', deletedAt: null }]));

    await scan();

    expect(dbMock.update).toHaveBeenCalledTimes(1); // only the miss on the old name
    expect(logScanEventMock).not.toHaveBeenCalled();
  });

  it('follows the code if it is renamed again (it always goes to the current link)', async () => {
    forwarded();
    dbMock.select.mockReturnValueOnce(chainable([{ shortCode: 'newest-name', deletedAt: null }]));

    expect((await scan()).headers.get('location')).toMatch(/\/q\/newest-name$/);
  });

  it('says the code was removed when the code it forwards to has been deleted, instead of redirecting', async () => {
    forwarded();
    dbMock.select
      .mockReturnValueOnce(chainable([{ shortCode: 'samsam-memorial', deletedAt: new Date() }]))
      .mockReturnValueOnce(chainable([{ id: 'qr-1', targetUrl: 'https://e.com', deletedAt: new Date() }]));

    const response = await scan();

    expect(response.status).toBe(404);
    expect(response.headers.get('location')).toBeNull();
  });

  it('is case-insensitive like every other link', async () => {
    forwarded();
    dbMock.select.mockReturnValueOnce(chainable([{ shortCode: 'samsam-memorial', deletedAt: null }]));

    expect((await scan('SamSam')).status).toBe(301);
  });
});

describe('/p/[code] for an old link forwarded to a page', () => {
  const PAGE = {
    id: 'page-1',
    name: 'Ana',
    description: null,
    puckData: { root: { props: {} }, content: [], zones: {} },
    isPublished: true,
    expiresAt: null,
    shortCode: 'ana-memorial',
  };
  const render = async (code: string) => {
    const { default: PublishedPage } = await import('@/app/p/[shortCode]/page');
    return renderToStaticMarkup(await PublishedPage({ params: Promise.resolve({ shortCode: code }) } as never));
  };
  const redirectOf = async (code: string): Promise<string> => {
    try {
      await render(code);
    } catch (error) {
      return (error as Error).message;
    }
    return 'RENDERED';
  };

  it('a forwarded link is a permanent redirect (308) to the page’s current address', async () => {
    dbMock.select
      .mockReturnValueOnce(chainable([])) // no page has this link
      .mockReturnValueOnce(chainable([{ qrCodeId: null, pageId: 'page-1', redirect: true }]))
      .mockReturnValueOnce(chainable([PAGE]));

    const digest = await redirectOf('old-page');

    expect(digest).toBe('REDIRECT 308 /p/ana-memorial');
  });

  it('a renamed page’s own old name stays a plain temporary redirect (307)', async () => {
    dbMock.select
      .mockReturnValueOnce(chainable([]))
      .mockReturnValueOnce(chainable([{ qrCodeId: null, pageId: 'page-1', redirect: false }]))
      .mockReturnValueOnce(chainable([PAGE]));

    const digest = await redirectOf('old-name');

    expect(digest).toBe('REDIRECT 307 /p/ana-memorial');
  });

  it('shows nothing for a forward to an unpublished page', async () => {
    dbMock.select
      .mockReturnValueOnce(chainable([]))
      .mockReturnValueOnce(chainable([{ qrCodeId: null, pageId: 'page-1', redirect: true }]))
      .mockReturnValueOnce(chainable([{ ...PAGE, isPublished: false }]));

    const digest = await redirectOf('old-page');

    expect(digest).toBe('NOT_FOUND');
  });
});
