import { redirect } from 'next/navigation';
import { and, asc, desc, eq, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import { pageTemplates } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { PageTemplateGallery } from '@/components/pages/page-template-gallery';

export default async function NewPagePage() {
  const user = await getCurrentUser();

  if (!user?.profile) {
    redirect('/login');
  }

  // System templates plus any template a teammate marked public. Your own
  // private pages aren't offered as starting points here.
  const templates = await db
    .select()
    .from(pageTemplates)
    .where(and(or(eq(pageTemplates.isSystem, true), eq(pageTemplates.isPublic, true))))
    .orderBy(desc(pageTemplates.isSystem), asc(pageTemplates.name));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New page</h1>
        <p className="text-muted-foreground">Start from a template or a blank page.</p>
      </div>
      <PageTemplateGallery templates={templates} />
    </div>
  );
}
