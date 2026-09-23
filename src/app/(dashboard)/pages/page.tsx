import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { pageTemplates } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { PageList } from '@/components/pages/page-list';

export default async function PagesListPage() {
  const user = await getCurrentUser();

  if (!user?.profile) {
    redirect('/login');
  }

  const items = await db
    .select()
    .from(pageTemplates)
    .where(eq(pageTemplates.userId, user.profile.id))
    .orderBy(desc(pageTemplates.updatedAt));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pages</h1>
        <p className="text-muted-foreground">
          Landing pages you can export as HTML or publish at a shareable link.
        </p>
      </div>
      <PageList initialItems={items} />
    </div>
  );
}
