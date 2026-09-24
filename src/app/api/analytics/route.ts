import { getCurrentUser } from '@/lib/auth/get-current-user';
import {
  getAnalyticsSummary,
  getScanEventsForExport,
  type ScanExportRow,
} from '@/lib/analytics/queries';

function toCsv(scans: ScanExportRow[]): string {
  const header = ['Scanned At', 'QR Code', 'Device', 'Browser', 'OS', 'Country', 'City', 'Referrer'];
  const rows = scans.map((scan) => [
    new Date(scan.scannedAt).toISOString(),
    scan.qrCodeName,
    scan.deviceType ?? '',
    scan.browser ?? '',
    scan.os ?? '',
    scan.country ?? '',
    scan.city ?? '',
    scan.referrer ?? '',
  ]);

  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

  return [header, ...rows].map((row) => row.map(escape).join(',')).join('\n');
}

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const qrId = searchParams.get('qrId') ?? undefined;
  const format = searchParams.get('format');

  const filters = {
    qrId,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  };

  if (format === 'csv') {
    return new Response(toCsv(await getScanEventsForExport(filters)), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="scan-events.csv"',
      },
    });
  }

  return Response.json(await getAnalyticsSummary(filters));
}
