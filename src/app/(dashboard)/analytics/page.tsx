import { redirect } from 'next/navigation';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { qrCodes } from '@/lib/db/schema';

import { getCurrentUser } from '@/lib/auth/get-current-user';
import { getAnalyticsSummary } from '@/lib/analytics/queries';
import { AnalyticsDashboard } from '@/components/analytics/analytics-dashboard';

const DEFAULT_RANGE_DAYS = 30;

export default async function AnalyticsPage() {
  const user = await getCurrentUser();

  if (!user?.profile) {
    redirect('/login');
  }

  const from = new Date();
  from.setDate(from.getDate() - DEFAULT_RANGE_DAYS);

  const [summary, qrOptions] = await Promise.all([
    getAnalyticsSummary({ from }),
    db
      .select({ id: qrCodes.id, name: qrCodes.name })
      .from(qrCodes)
      .where(
        and(eq(qrCodes.isDynamic, true), isNull(qrCodes.deletedAt)),
      )
      .orderBy(asc(qrCodes.name)),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">Scan activity across all your dynamic QR codes.</p>
      </div>
      <AnalyticsDashboard initialSummary={summary} qrOptions={qrOptions} />
    </div>
  );
}
