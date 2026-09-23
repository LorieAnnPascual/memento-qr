export const COMPARE_DAY_OPTIONS = [7, 30, 90] as const;
export type CompareDays = (typeof COMPARE_DAY_OPTIONS)[number];

export function parseCompareDays(value: string | undefined): CompareDays {
  const parsed = Number.parseInt(value ?? '', 10);
  return COMPARE_DAY_OPTIONS.find((option) => option === parsed) ?? 30;
}

export interface DailyPoint {
  date: string;
  count: number;
}

export interface ComparisonPoint {
  date: string;
  a: number;
  b: number;
}

function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Midnight (UTC) at the start of the oldest day shown, so queries and the chart cover the same days. */
export function rangeStart(days: number, now: Date = new Date()): Date {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

/** One row per day for the last `days` days (oldest first), with zeros where a code had no scans. */
export function buildComparisonSeries(
  a: DailyPoint[],
  b: DailyPoint[],
  days: number,
  now: Date = new Date(),
): ComparisonPoint[] {
  const countsA = new Map(a.map((point) => [point.date, point.count]));
  const countsB = new Map(b.map((point) => [point.date, point.count]));

  return Array.from({ length: days }, (_, index) => {
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() - (days - 1 - index));
    const date = toIsoDay(day);
    return { date, a: countsA.get(date) ?? 0, b: countsB.get(date) ?? 0 };
  });
}

export type Verdict =
  | { kind: 'no-data' }
  | { kind: 'tie'; scans: number }
  | { kind: 'leader'; leader: 'a' | 'b'; percentMore: number | null; leaderScans: number; otherScans: number };

/** Which code is ahead on scans. `percentMore` is null when the other has none (no meaningful ratio). */
export function compareScans(scansA: number, scansB: number): Verdict {
  if (scansA === 0 && scansB === 0) return { kind: 'no-data' };
  if (scansA === scansB) return { kind: 'tie', scans: scansA };

  const leader = scansA > scansB ? 'a' : 'b';
  const leaderScans = Math.max(scansA, scansB);
  const otherScans = Math.min(scansA, scansB);

  return {
    kind: 'leader',
    leader,
    leaderScans,
    otherScans,
    percentMore: otherScans === 0 ? null : Math.round(((leaderScans - otherScans) / otherScans) * 100),
  };
}
