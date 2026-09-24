import { redirect } from 'next/navigation';
import { and, asc, inArray, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { qrCodes, type QRCode } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { buildComparisonSeries, parseCompareDays, rangeStart } from '@/lib/analytics/compare';
import { getAnalyticsSummary, type AnalyticsSummary } from '@/lib/analytics/queries';
import { ComparePicker } from '@/components/qr/compare-picker';
import { QRCompare, type CompareSide } from '@/components/qr/qr-compare';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toSide(qr: QRCode, summary: AnalyticsSummary): CompareSide {
  const mobile = summary.deviceBreakdown.find((entry) => entry.type === 'mobile')?.count ?? 0;

  return {
    id: qr.id,
    name: qr.name,
    qrType: qr.qrType,
    payload: qr.payload,
    styleConfig: qr.styleConfig,
    isDynamic: qr.isDynamic,
    totalScans: summary.totalScans,
    uniqueVisitors: summary.uniqueVisitors,
    mobileShare: summary.totalScans > 0 ? Math.round((mobile / summary.totalScans) * 100) : null,
    topCountry: summary.topCountries[0]?.country ?? null,
  };
}

export default async function CompareQRPage({ searchParams }: PageProps<'/qr/compare'>) {
  const user = await getCurrentUser();

  if (!user?.profile) {
    redirect('/login');
  }

  const params = await searchParams;
  const aId = typeof params.a === 'string' && UUID.test(params.a) ? params.a : undefined;
  const bId = typeof params.b === 'string' && UUID.test(params.b) ? params.b : undefined;
  const days = parseCompareDays(typeof params.days === 'string' ? params.days : undefined);

  const own = isNull(qrCodes.deletedAt);

  const options = await db
    .select({ id: qrCodes.id, name: qrCodes.name })
    .from(qrCodes)
    .where(own)
    .orderBy(asc(qrCodes.name))
    .limit(500);

  let comparison: { a: CompareSide; b: CompareSide; series: ReturnType<typeof buildComparisonSeries> } | null = null;

  if (aId && bId && aId !== bId) {
    const found = await db
      .select()
      .from(qrCodes)
      .where(and(own, inArray(qrCodes.id, [aId, bId])));
    const qrA = found.find((qr) => qr.id === aId);
    const qrB = found.find((qr) => qr.id === bId);

    if (qrA && qrB) {
      const from = rangeStart(days);
      const [summaryA, summaryB] = await Promise.all([
        getAnalyticsSummary({ qrId: aId, from }),
        getAnalyticsSummary({ qrId: bId, from }),
      ]);

      comparison = {
        a: toSide(qrA, summaryA),
        b: toSide(qrB, summaryB),
        series: buildComparisonSeries(summaryA.dailyScans, summaryB.dailyScans, days),
      };
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Compare QR codes</h1>
        <p className="text-muted-foreground">
          See two codes side by side, for example two designs pointing at the same place.
        </p>
      </div>

      <ComparePicker
        key={`${aId ?? ''}-${bId ?? ''}`}
        options={options}
        initialA={comparison?.a.id ?? aId}
        initialB={comparison?.b.id ?? bId}
      />

      {aId && bId && !comparison && (
        <p role="alert" className="text-sm text-destructive">
          One of those QR codes could not be found. Choose two codes from your list.
        </p>
      )}

      {comparison && <QRCompare a={comparison.a} b={comparison.b} series={comparison.series} days={days} />}
    </div>
  );
}
