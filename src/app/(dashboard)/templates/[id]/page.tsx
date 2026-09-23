import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { qrTemplates } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { TemplateEditForm } from '@/components/qr/template-edit-form';

export default async function EditTemplatePage({ params }: PageProps<'/templates/[id]'>) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user?.profile) {
    redirect('/login');
  }

  const [template] = await db.select().from(qrTemplates).where(eq(qrTemplates.id, id)).limit(1);

  if (!template || template.isSystem || template.userId !== user.profile.id) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Edit Template</h1>
        <p className="text-muted-foreground">{template.name}</p>
      </div>
      <TemplateEditForm template={template} />
    </div>
  );
}
