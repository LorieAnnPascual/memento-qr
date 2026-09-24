import { describe, it, expect, vi, beforeEach } from 'vitest';

import { chainable } from '../helpers/db-mock';

const dbMock = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: dbMock }));

import { getActivityPage } from '@/lib/activity/queries';
import { getAnalyticsSummary, getScanEventsForExport } from '@/lib/analytics/queries';
import { getPublishStatus } from '@/lib/pages/page-publisher';

beforeEach(() => {
  for (const fn of Object.values(dbMock)) fn.mockReset();
});

describe('getAnalyticsSummary', () => {
  function stubSelects(overrides: Partial<Record<string, unknown[]>> = {}): void {
    const results: unknown[][] = [
      overrides.totals ?? [{ totalScans: 12, uniqueVisitors: 5 }],
      overrides.daily ?? [{ date: '2026-03-01', count: 7 }, { date: '2026-03-02', count: 5 }],
      overrides.devices ?? [{ type: 'mobile', count: 8 }, { type: 'desktop', count: 4 }],
      overrides.browsers ?? [{ browser: 'Chrome', count: 12 }],
      overrides.countries ?? [{ country: 'Philippines', count: 12 }],
      overrides.cities ?? [{ city: 'Manila', country: 'Philippines', count: 12 }],
      overrides.topQr ?? [{ id: 'q1', name: 'Menu', count: 12 }],
      overrides.recent ?? [{ id: 's1', qrCodeId: 'q1', qrCodeName: 'Menu', scannedAt: new Date() }],
    ];
    for (const rows of results) dbMock.select.mockReturnValueOnce(chainable(rows));
  }

  it('assembles every section from its own query', async () => {
    stubSelects();

    const summary = await getAnalyticsSummary({});

    expect(summary.totalScans).toBe(12);
    expect(summary.uniqueVisitors).toBe(5);
    expect(summary.dailyScans).toHaveLength(2);
    expect(summary.deviceBreakdown[0]).toEqual({ type: 'mobile', count: 8 });
    expect(summary.browserBreakdown[0].browser).toBe('Chrome');
    expect(summary.topCountries[0].country).toBe('Philippines');
    expect(summary.topCities[0].city).toBe('Manila');
    expect(summary.topQrCode).toEqual({ id: 'q1', name: 'Menu', count: 12 });
    expect(summary.recentScans).toHaveLength(1);
    expect(dbMock.select).toHaveBeenCalledTimes(8);
  });

  it('returns zeros and empty lists when there are no scans', async () => {
    stubSelects({ totals: [], daily: [], devices: [], browsers: [], countries: [], cities: [], topQr: [], recent: [] });

    const summary = await getAnalyticsSummary({ from: new Date('2026-01-01'), to: new Date('2026-02-01'), qrId: 'q1' });

    expect(summary).toMatchObject({
      totalScans: 0,
      uniqueVisitors: 0,
      dailyScans: [],
      deviceBreakdown: [],
      topCountries: [],
      topQrCode: null,
      recentScans: [],
    });
  });
});

describe('getScanEventsForExport', () => {
  it('returns every matching scan row', async () => {
    const rows = [{ scannedAt: new Date(), qrCodeName: 'Menu', deviceType: 'mobile' }];
    dbMock.select.mockReturnValueOnce(chainable(rows));

    expect(await getScanEventsForExport({ qrId: 'q1', from: new Date(), to: new Date() })).toEqual(rows);
  });
});

describe('getPublishStatus', () => {
  it('returns null for a page that does not exist', async () => {
    dbMock.select.mockReturnValueOnce(chainable([]));

    expect(await getPublishStatus('missing')).toBeNull();
  });

  it('reports an unpublished page', async () => {
    dbMock.select.mockReturnValueOnce(chainable([{ isPublished: false, shortCode: null, publishedAt: null, expiresAt: null }]));

    expect(await getPublishStatus('p1')).toMatchObject({ isPublished: false, isExpired: false, shortCode: null });
  });

  it('reports a live page with its public link', async () => {
    dbMock.select.mockReturnValueOnce(chainable([{ isPublished: true, shortCode: 'abc234', publishedAt: new Date(), expiresAt: null }]));

    const status = await getPublishStatus('p1');

    expect(status?.isPublished).toBe(true);
    expect(status?.publishedUrl).toContain('/p/abc234');
  });

  it('flags an expired page', async () => {
    dbMock.select.mockReturnValueOnce(chainable([{ isPublished: true, shortCode: 'abc234', publishedAt: new Date(), expiresAt: new Date(Date.now() - 1000) }]));

    expect((await getPublishStatus('p1'))?.isExpired).toBe(true);
  });

  it('does not flag a page whose expiry is in the future', async () => {
    dbMock.select.mockReturnValueOnce(chainable([{ isPublished: true, shortCode: 'abc234', publishedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) }]));

    expect((await getPublishStatus('p1'))?.isExpired).toBe(false);
  });
});

describe('getActivityPage', () => {
  it('returns rows with the total, for any filter', async () => {
    dbMock.select.mockReturnValueOnce(chainable([{ id: 'a1' }])).mockReturnValueOnce(chainable([{ total: 51 }]));

    expect(await getActivityPage(2, 'qr')).toEqual({ rows: [{ id: 'a1' }], total: 51 });
  });

  it('treats a page below 1 as page 1', async () => {
    dbMock.select.mockReturnValueOnce(chainable([])).mockReturnValueOnce(chainable([{ total: 0 }]));

    expect((await getActivityPage(-5, 'all')).total).toBe(0);
  });
});
