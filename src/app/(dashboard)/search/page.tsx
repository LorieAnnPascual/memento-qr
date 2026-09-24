import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/get-current-user';
import { countResults, isSearchable, MIN_QUERY_LENGTH, searchWorkspace } from '@/lib/search/search';
import { getTeamMembers } from '@/lib/team/members';
import { getQRTypeLabel, type QRType } from '@/types/qr';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SearchForm } from '@/components/layout/search-form';

export default async function SearchPage({ searchParams }: PageProps<'/search'>) {
  const user = await getCurrentUser();

  if (!user?.profile) {
    redirect('/login');
  }

  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q) ?? '';
  const searchable = isSearchable(query);

  const [results, members] = await Promise.all([searchWorkspace(query), getTeamMembers()]);
  const assignee = (id: string | null): string | null => members.find((m) => m.id === id)?.name ?? null;
  const total = countResults(results);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <SearchForm defaultValue={query} autoFocus />
      </div>

      {!searchable ? (
        <p className="text-muted-foreground">
          Type at least {MIN_QUERY_LENGTH} characters to search QR codes, pages, folders and templates.
        </p>
      ) : total === 0 ? (
        <p className="text-muted-foreground" role="status">
          Nothing matches &ldquo;{results.query}&rdquo;. Try a shorter word, or part of a name, note or link.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground" role="status">
          {total} result{total === 1 ? '' : 's'} for &ldquo;{results.query}&rdquo;
        </p>
      )}

      {results.qrCodes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">QR codes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {results.qrCodes.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Link href={`/qr/${item.id}`} className="font-medium hover:underline">
                    {item.name}
                  </Link>
                  <Badge variant="secondary">{getQRTypeLabel(item.qrType as QRType)}</Badge>
                  {item.isDynamic && <Badge variant="outline">Dynamic</Badge>}
                  {item.isPaused && <Badge variant="destructive">Paused</Badge>}
                  {assignee(item.assignedTo) && <Badge variant="outline">Assigned to {assignee(item.assignedTo)}</Badge>}
                  {item.nextAction && <span className="text-sm text-muted-foreground">Next: {item.nextAction}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {results.pages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pages</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {results.pages.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Link href={`/pages/${item.id}`} className="font-medium hover:underline">
                    {item.name}
                  </Link>
                  <Badge variant="secondary" className="capitalize">
                    {item.category}
                  </Badge>
                  {item.isPublished && <Badge>Published</Badge>}
                  {assignee(item.assignedTo) && <Badge variant="outline">Assigned to {assignee(item.assignedTo)}</Badge>}
                  {item.nextAction && <span className="text-sm text-muted-foreground">Next: {item.nextAction}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {results.folders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Folders</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {results.folders.map((item) => (
                <li key={item.id} className="py-2">
                  <Link href={`/qr?folder=${item.id}`} className="font-medium hover:underline">
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {results.templates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Templates</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {results.templates.map((item) => (
                <li key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center gap-2 py-2">
                  <Link href={item.kind === 'qr' ? '/templates' : '/pages/new'} className="font-medium hover:underline">
                    {item.name}
                  </Link>
                  <Badge variant="secondary">{item.kind === 'qr' ? 'QR design' : 'Page design'}</Badge>
                  <Badge variant="outline" className="capitalize">
                    {item.category}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
