import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { qrTemplates } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { CardBuilder } from '@/components/qr/card-builder/card-builder';

export default async function CardBuilderPage({ searchParams }: PageProps<'/templates/builder'>) {
  const { id } = await searchParams;
  const user = await getCurrentUser();

  if (!user?.profile) {
    redirect('/login');
  }

  let initialTemplate = undefined;

  if (typeof id === 'string') {
    const [template] = await db.select().from(qrTemplates).where(eq(qrTemplates.id, id)).limit(1);

    if (!template || template.isSystem || template.userId !== user.profile.id) {
      notFound();
    }

    initialTemplate = template;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Card Builder</h1>
        <p className="text-muted-foreground">
          Design a card layout from scratch — add text, shapes, and your own graphics.
        </p>
      </div>
      <CardBuilder initialTemplate={initialTemplate} />
    </div>
  );
}
