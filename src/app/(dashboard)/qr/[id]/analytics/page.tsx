import { notFound, redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { qrCodes } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { getAnalyticsSummary } from '@/lib/analytics/queries';
import { AnalyticsDashboard } from '@/components/analytics/analytics-dashboard';

const DEFAULT_RANGE_DAYS = 30;

export default async function QRAnalyticsPage({ params }: PageProps<'/qr/[id]/analytics'>) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user?.profile) {
    redirect('/login');
  }

  const [qrCode] = await db
    .select()
    .from(qrCodes)
    .where(and(eq(qrCodes.id, id), isNull(qrCodes.deletedAt)))
    .limit(1);

  if (!qrCode) {
    notFound();
  }

  const from = new Date();
  from.setDate(from.getDate() - DEFAULT_RANGE_DAYS);

  const summary = await getAnalyticsSummary({ qrId: id, from });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">{qrCode.name}</p>
      </div>
      <AnalyticsDashboard qrId={id} initialSummary={summary} showTopQrCode={false} />
    </div>
  );
}
