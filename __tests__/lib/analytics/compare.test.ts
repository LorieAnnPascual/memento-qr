import { describe, it, expect } from 'vitest';

import {
  buildComparisonSeries,
  compareScans,
  parseCompareDays,
  rangeStart,
} from '@/lib/analytics/compare';
import { backupFileName, buildBackup, MAX_BACKUP_SCAN_EVENTS } from '@/lib/export/build-backup';

const NOW = new Date('2026-03-10T15:30:00Z');

describe('parseCompareDays', () => {
  it('accepts the supported ranges and defaults to 30', () => {
    expect(parseCompareDays('7')).toBe(7);
    expect(parseCompareDays('90')).toBe(90);
    expect(parseCompareDays('14')).toBe(30);
    expect(parseCompareDays(undefined)).toBe(30);
    expect(parseCompareDays('abc')).toBe(30);
  });
});

describe('rangeStart', () => {
  it('starts at UTC midnight of the oldest day shown', () => {
    expect(rangeStart(7, NOW).toISOString()).toBe('2026-03-04T00:00:00.000Z');
    expect(rangeStart(1, NOW).toISOString()).toBe('2026-03-10T00:00:00.000Z');
  });
});

describe('buildComparisonSeries', () => {
  it('returns one row per day, oldest first, ending today', () => {
    const series = buildComparisonSeries([], [], 7, NOW);

    expect(series).toHaveLength(7);
    expect(series[0].date).toBe('2026-03-04');
    expect(series[6].date).toBe('2026-03-10');
  });

  it('fills missing days with zero and keeps each code separate', () => {
    const series = buildComparisonSeries(
      [{ date: '2026-03-10', count: 4 }],
      [{ date: '2026-03-09', count: 2 }],
      3,
      NOW,
    );

    expect(series).toEqual([
      { date: '2026-03-08', a: 0, b: 0 },
      { date: '2026-03-09', a: 0, b: 2 },
      { date: '2026-03-10', a: 4, b: 0 },
    ]);
  });

  it('ignores scans outside the window', () => {
    const series = buildComparisonSeries([{ date: '2025-01-01', count: 99 }], [], 3, NOW);

    expect(series.every((point) => point.a === 0)).toBe(true);
  });

  it('aligns with the query window (same first day)', () => {
    expect(buildComparisonSeries([], [], 30, NOW)[0].date).toBe(rangeStart(30, NOW).toISOString().slice(0, 10));
  });
});

describe('compareScans', () => {
  it('reports no data when neither has scans', () => {
    expect(compareScans(0, 0)).toEqual({ kind: 'no-data' });
  });

  it('reports a tie', () => {
    expect(compareScans(5, 5)).toEqual({ kind: 'tie', scans: 5 });
  });

  it('names the leader and how much further ahead it is', () => {
    expect(compareScans(150, 100)).toEqual({ kind: 'leader', leader: 'a', percentMore: 50, leaderScans: 150, otherScans: 100 });
    expect(compareScans(10, 30)).toMatchObject({ leader: 'b', percentMore: 200 });
  });

  it('has no percentage when the other code has no scans', () => {
    expect(compareScans(0, 8)).toMatchObject({ leader: 'b', percentMore: null });
  });
});

describe('buildBackup', () => {
  const data = {
    scope: 'mine' as const,
    exportedBy: 'a@b.co',
    folders: [{}],
    qrCodes: [{}, {}],
    qrTemplates: [],
    pages: [{}],
    scanEvents: [{}, {}, {}],
    activity: [],
  };

  it('adds metadata and accurate counts', () => {
    const backup = buildBackup(data, NOW);

    expect(backup).toMatchObject({
      app: 'memento-qr',
      formatVersion: 1,
      exportedAt: NOW.toISOString(),
      scope: 'mine',
      exportedBy: 'a@b.co',
      counts: { folders: 1, qrCodes: 2, qrTemplates: 0, pages: 1, scanEvents: 3, activity: 0 },
      scanEventsTruncated: false,
    });
  });

  it('flags truncated scan history', () => {
    const backup = buildBackup({ ...data, scanEvents: new Array(MAX_BACKUP_SCAN_EVENTS).fill({}) }, NOW);

    expect(backup.scanEventsTruncated).toBe(true);
  });

  it('names the file by date', () => {
    expect(backupFileName(NOW)).toBe('memento-qr-backup-2026-03-10.json');
  });
});
