import { and, countDistinct, desc, eq, gte, isNull, lte, sql, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { qrCodes, scanEvents } from '@/lib/db/schema';

export interface AnalyticsFilters {
  userId: string;
  qrId?: string;
  from?: Date;
  to?: Date;
}

export interface AnalyticsSummary {
  totalScans: number;
  uniqueVisitors: number;
  dailyScans: { date: string; count: number }[];
  deviceBreakdown: { type: string; count: number }[];
  browserBreakdown: { browser: string; count: number }[];
  topCountries: { country: string; count: number }[];
  topCities: { city: string; country: string; count: number }[];
  topQrCode: { id: string; name: string; count: number } | null;
  recentScans: {
    id: string;
    qrCodeId: string;
    qrCodeName: string;
    deviceType: string | null;
    browser: string | null;
    os: string | null;
    country: string | null;
    city: string | null;
    referrer: string | null;
    scannedAt: Date;
  }[];
}

const RECENT_SCANS_LIMIT = 50;
const TOP_LIST_LIMIT = 10;

function buildWhere(filters: AnalyticsFilters): SQL {
  const conditions = [eq(qrCodes.userId, filters.userId), isNull(qrCodes.deletedAt)];
  if (filters.qrId) conditions.push(eq(qrCodes.id, filters.qrId));
  if (filters.from) conditions.push(gte(scanEvents.scannedAt, filters.from));
  if (filters.to) conditions.push(lte(scanEvents.scannedAt, filters.to));
  return and(...conditions)!;
}

export async function getAnalyticsSummary(filters: AnalyticsFilters): Promise<AnalyticsSummary> {
  const where = buildWhere(filters);

  // Drizzle queries only run when awaited, so these are started together below.
  const totalsQuery = db
    .select({
      totalScans: sql<number>`count(*)`.mapWith(Number),
      uniqueVisitors: countDistinct(scanEvents.ipHash),
    })
    .from(scanEvents)
    .innerJoin(qrCodes, eq(scanEvents.qrCodeId, qrCodes.id))
    .where(where);

  const dailyScansQuery = db
    .select({
      date: sql<string>`to_char(${scanEvents.scannedAt}, 'YYYY-MM-DD')`,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(scanEvents)
    .innerJoin(qrCodes, eq(scanEvents.qrCodeId, qrCodes.id))
    .where(where)
    .groupBy(sql`to_char(${scanEvents.scannedAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${scanEvents.scannedAt}, 'YYYY-MM-DD')`);

  const deviceQuery = db
    .select({
      type: sql<string>`coalesce(${scanEvents.deviceType}, 'Unknown')`,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(scanEvents)
    .innerJoin(qrCodes, eq(scanEvents.qrCodeId, qrCodes.id))
    .where(where)
    .groupBy(scanEvents.deviceType)
    .orderBy(desc(sql`count(*)`));

  const browserQuery = db
    .select({
      browser: sql<string>`coalesce(${scanEvents.browser}, 'Unknown')`,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(scanEvents)
    .innerJoin(qrCodes, eq(scanEvents.qrCodeId, qrCodes.id))
    .where(where)
    .groupBy(scanEvents.browser)
    .orderBy(desc(sql`count(*)`));

  const countriesQuery = db
    .select({
      country: sql<string>`coalesce(${scanEvents.country}, 'Unknown')`,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(scanEvents)
    .innerJoin(qrCodes, eq(scanEvents.qrCodeId, qrCodes.id))
    .where(where)
    .groupBy(scanEvents.country)
    .orderBy(desc(sql`count(*)`))
    .limit(TOP_LIST_LIMIT);

  const citiesQuery = db
    .select({
      city: sql<string>`coalesce(${scanEvents.city}, 'Unknown')`,
      country: sql<string>`coalesce(${scanEvents.country}, 'Unknown')`,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(scanEvents)
    .innerJoin(qrCodes, eq(scanEvents.qrCodeId, qrCodes.id))
    .where(where)
    .groupBy(scanEvents.city, scanEvents.country)
    .orderBy(desc(sql`count(*)`))
    .limit(TOP_LIST_LIMIT);

  const topQrQuery = db
    .select({
      id: qrCodes.id,
      name: qrCodes.name,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(scanEvents)
    .innerJoin(qrCodes, eq(scanEvents.qrCodeId, qrCodes.id))
    .where(where)
    .groupBy(qrCodes.id, qrCodes.name)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  const recentQuery = db
    .select({
      id: scanEvents.id,
      qrCodeId: scanEvents.qrCodeId,
      qrCodeName: qrCodes.name,
      deviceType: scanEvents.deviceType,
      browser: scanEvents.browser,
      os: scanEvents.os,
      country: scanEvents.country,
      city: scanEvents.city,
      referrer: scanEvents.referrer,
      scannedAt: scanEvents.scannedAt,
    })
    .from(scanEvents)
    .innerJoin(qrCodes, eq(scanEvents.qrCodeId, qrCodes.id))
    .where(where)
    .orderBy(desc(scanEvents.scannedAt))
    .limit(RECENT_SCANS_LIMIT);

  const [
    [totals],
    dailyScansRaw,
    deviceBreakdown,
    browserBreakdown,
    topCountriesRaw,
    topCitiesRaw,
    [topQr],
    recentScansRaw,
  ] = await Promise.all([
    totalsQuery,
    dailyScansQuery,
    deviceQuery,
    browserQuery,
    countriesQuery,
    citiesQuery,
    topQrQuery,
    recentQuery,
  ]);

  return {
    totalScans: totals?.totalScans ?? 0,
    uniqueVisitors: totals?.uniqueVisitors ?? 0,
    dailyScans: dailyScansRaw,
    deviceBreakdown,
    browserBreakdown,
    topCountries: topCountriesRaw,
    topCities: topCitiesRaw,
    topQrCode: topQr ?? null,
    recentScans: recentScansRaw,
  };
}

export interface ScanExportRow {
  scannedAt: Date;
  qrCodeName: string;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  city: string | null;
  referrer: string | null;
}

/** Every scan event matching the filters (no row cap) — for CSV export. */
export async function getScanEventsForExport(filters: AnalyticsFilters): Promise<ScanExportRow[]> {
  return db
    .select({
      scannedAt: scanEvents.scannedAt,
      qrCodeName: qrCodes.name,
      deviceType: scanEvents.deviceType,
      browser: scanEvents.browser,
      os: scanEvents.os,
      country: scanEvents.country,
      city: scanEvents.city,
      referrer: scanEvents.referrer,
    })
    .from(scanEvents)
    .innerJoin(qrCodes, eq(scanEvents.qrCodeId, qrCodes.id))
    .where(buildWhere(filters))
    .orderBy(desc(scanEvents.scannedAt));
}
