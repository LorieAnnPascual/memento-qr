import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { pageTemplates } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { getTeamMembers } from '@/lib/team/members';
import { PageList } from '@/components/pages/page-list';

export default async function PagesListPage() {
  const user = await getCurrentUser();

  if (!user?.profile) {
    redirect('/login');
  }

  const [items, members] = await Promise.all([
    db
      .select()
      .from(pageTemplates)
      .where(eq(pageTemplates.isSystem, false))
      .orderBy(desc(pageTemplates.updatedAt)),
    getTeamMembers(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pages</h1>
        <p className="text-muted-foreground">
          The team&apos;s landing pages. Export them as HTML or publish them at a shareable link.
        </p>
      </div>
      <PageList initialItems={items} members={members} />
    </div>
  );
}
