import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/get-current-user';
import { describeActivity } from '@/lib/activity/describe';
import {
  ACTIVITY_FILTERS,
  ACTIVITY_PAGE_SIZE,
  getActivityPage,
  parseActivityFilter,
} from '@/lib/activity/queries';
import { formatRelativeTime } from '@/lib/utils/format-relative-time';
import { Button } from '@/components/ui/button';

const FILTER_LABELS: Record<(typeof ACTIVITY_FILTERS)[number], string> = {
  all: 'Everything',
  qr: 'QR codes',
  page: 'Pages',
  folder: 'Folders',
  template: 'Templates',
  export: 'Backups',
};

export default async function ActivityPage({ searchParams }: PageProps<'/activity'>) {
  const user = await getCurrentUser();

  if (!user?.profile) {
    redirect('/login');
  }

  const params = await searchParams;
  const filter = parseActivityFilter(typeof params.type === 'string' ? params.type : undefined);
  const page = Math.max(1, Number.parseInt(typeof params.page === 'string' ? params.page : '1', 10) || 1);

  const { rows, total } = await getActivityPage(page, filter);
  const totalPages = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE));
  const href = (nextPage: number, nextFilter = filter): string =>
    `/activity?${new URLSearchParams({ ...(nextFilter !== 'all' && { type: nextFilter }), page: String(nextPage) })}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-muted-foreground">What everyone on the team has been doing.</p>
      </div>

      <nav aria-label="Activity filter" className="flex flex-wrap gap-2">
        {ACTIVITY_FILTERS.map((option) => (
          <Button
            key={option}
            asChild
            size="sm"
            variant={option === filter ? 'default' : 'outline'}
          >
            <Link href={href(1, option)} aria-current={option === filter ? 'page' : undefined}>
              {FILTER_LABELS[option]}
            </Link>
          </Button>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          Nothing here yet. Actions like creating or publishing will show up as they happen.
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((row) => {
            const actor = row.actorName ?? row.actorEmail ?? 'Someone';
            return (
              <li key={row.id} className="flex items-baseline justify-between gap-4 px-4 py-3 text-sm">
                <p>
                  <span className="font-medium">{actor}</span> {describeActivity(row)}
                </p>
                <time
                  dateTime={row.createdAt.toISOString()}
                  title={row.createdAt.toLocaleString()}
                  className="shrink-0 text-muted-foreground"
                >
                  {formatRelativeTime(row.createdAt)}
                </time>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={href(page - 1)}>Previous</Link>
              </Button>
            )}
            {page < totalPages && (
              <Button asChild variant="outline" size="sm">
                <Link href={href(page + 1)}>Next</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
