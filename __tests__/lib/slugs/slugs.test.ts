import { describe, it, expect, vi, beforeEach } from 'vitest';

import { chainable } from '../../helpers/db-mock';

const dbMock = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), transaction: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: dbMock }));

import {
  checkRequestedSlug,
  getSlugState,
  isSlugAvailable,
  releaseDeletedSlug,
  resolveAlias,
} from '@/lib/slugs/slugs';

/** `getSlugState` reads "is it anyone's current link?" first, then "is it an old or forwarded name?". */
function rows(current: object[], alias: object[] = []): void {
  dbMock.select.mockReset(); // an early match leaves the second answer unused: never let it leak into the next call
  dbMock.select.mockReturnValueOnce(chainable(current)).mockReturnValueOnce(chainable(alias));
}

beforeEach(() => {
  for (const fn of Object.values(dbMock)) fn.mockReset();
});

describe('getSlugState for QR codes', () => {
  it('is free when nothing uses the name', async () => {
    rows([]);

    expect(await getSlugState('qr', 'samsam')).toBe('free');
  });

  it('is taken by another live code’s link', async () => {
    rows([{ id: 'other', deletedAt: null }]);

    expect(await getSlugState('qr', 'samsam')).toBe('taken');
  });

  it('is "deleted" when the code that had it was deleted: reserved, but it can be reused after a confirmation', async () => {
    rows([{ id: 'gone', deletedAt: new Date() }]);

    expect(await getSlugState('qr', 'samsam')).toBe('deleted');
  });

  it('is "deleted" when it was only an old name or forward of a code that has since been deleted', async () => {
    rows([], [{ qrCodeId: 'gone', deletedAt: new Date() }]);

    expect(await getSlugState('qr', 'samsam')).toBe('deleted');
  });

  it('is taken when it is an old name or forward of a live code', async () => {
    rows([], [{ qrCodeId: 'live', deletedAt: null }]);

    expect(await getSlugState('qr', 'samsam')).toBe('taken');
  });

  it('is the code’s own when it is its link or one of its old names or forwards', async () => {
    rows([{ id: 'me', deletedAt: null }]);
    expect(await getSlugState('qr', 'samsam', 'me')).toBe('own');

    rows([], [{ qrCodeId: 'me', deletedAt: null }]);
    expect(await getSlugState('qr', 'samsam', 'me')).toBe('own');
  });
});

describe('getSlugState for pages', () => {
  it('is free, taken or own, and never "deleted" (a deleted page frees its names)', async () => {
    rows([]);
    expect(await getSlugState('page', 'ana')).toBe('free');

    rows([{ id: 'other' }]);
    expect(await getSlugState('page', 'ana')).toBe('taken');

    rows([], [{ pageId: 'other' }]);
    expect(await getSlugState('page', 'ana')).toBe('taken');

    rows([], [{ pageId: 'me' }]);
    expect(await getSlugState('page', 'ana', 'me')).toBe('own');
  });
});

describe('isSlugAvailable', () => {
  it('is true for a free name and the item’s own, false for taken and for a deleted code’s', async () => {
    rows([]);
    expect(await isSlugAvailable('qr', 'a-name')).toBe(true);

    rows([{ id: 'me', deletedAt: null }]);
    expect(await isSlugAvailable('qr', 'a-name', 'me')).toBe(true);

    rows([{ id: 'other', deletedAt: null }]);
    expect(await isSlugAvailable('qr', 'a-name')).toBe(false);

    rows([{ id: 'gone', deletedAt: new Date() }]);
    expect(await isSlugAvailable('qr', 'a-name')).toBe(false);
  });
});

describe('releaseDeletedSlug', () => {
  it('takes the link off the deleted code and drops its old-name and forward records', async () => {
    const set = vi.fn().mockReturnValue(chainable([]));
    dbMock.update.mockReturnValue({ set });
    dbMock.delete.mockReturnValue(chainable([]));

    await releaseDeletedSlug('samsam');

    expect(set).toHaveBeenCalledWith({ shortCode: null });
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
  });
});

describe('resolveAlias', () => {
  it('says whether an old name is the item’s own (serve it) or a forward (redirect)', async () => {
    dbMock.select.mockReturnValueOnce(chainable([{ qrCodeId: 'qr-1', pageId: null, redirect: false }]));
    expect(await resolveAlias('qr', 'old')).toEqual({ id: 'qr-1', redirect: false });

    dbMock.select.mockReturnValueOnce(chainable([{ qrCodeId: 'qr-2', pageId: null, redirect: true }]));
    expect(await resolveAlias('qr', 'fwd')).toEqual({ id: 'qr-2', redirect: true });

    dbMock.select.mockReturnValueOnce(chainable([{ qrCodeId: null, pageId: 'page-1', redirect: true }]));
    expect(await resolveAlias('page', 'fwd')).toEqual({ id: 'page-1', redirect: true });
  });

  it('is null when there is no such old name', async () => {
    dbMock.select.mockReturnValueOnce(chainable([]));

    expect(await resolveAlias('qr', 'nothing')).toBeNull();
  });
});

describe('checkRequestedSlug and deleted codes', () => {
  it('refuses a deleted code’s name until the person confirms (409 SLUG_DELETED)', async () => {
    rows([{ id: 'gone', deletedAt: new Date() }]);

    const result = await checkRequestedSlug('qr', 'samsam');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(409);
      expect((await result.response.json()).code).toBe('SLUG_DELETED');
    }
  });

  it('allows it once confirmed, and says the name has to be released first', async () => {
    rows([{ id: 'gone', deletedAt: new Date() }]);

    expect(await checkRequestedSlug('qr', 'samsam', undefined, true)).toEqual({ ok: true, slug: 'samsam', reclaim: true });
  });

  it('still refuses a live code’s name, confirmed or not', async () => {
    rows([{ id: 'live', deletedAt: null }]);

    const result = await checkRequestedSlug('qr', 'samsam', undefined, true);

    expect(result.ok).toBe(false);
  });

  it('needs no release for a free name', async () => {
    rows([]);

    expect(await checkRequestedSlug('qr', 'samsam', undefined, true)).toEqual({ ok: true, slug: 'samsam', reclaim: false });
  });
});
