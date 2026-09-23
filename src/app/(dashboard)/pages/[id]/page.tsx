import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { pageTemplates } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { PageEditor } from '@/components/pages/page-editor';

export default async function EditPagePage({ params }: PageProps<'/pages/[id]'>) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user?.profile) {
    redirect('/login');
  }

  const [page] = await db.select().from(pageTemplates).where(eq(pageTemplates.id, id)).limit(1);

  // System templates can't be edited in place; they're copied from /pages/new.
  if (!page || page.isSystem || page.userId !== user.profile.id) {
    notFound();
  }

  return <PageEditor page={page} />;
}
