import Link from 'next/link';
import { redirect } from 'next/navigation';
import { asc, desc, eq, or } from 'drizzle-orm';

import { Paintbrush } from 'lucide-react';

import { db } from '@/lib/db';
import { qrTemplates } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { Button } from '@/components/ui/button';
import { TemplateGallery } from '@/components/qr/template-gallery';

export default async function TemplatesPage() {
  const user = await getCurrentUser();

  if (!user?.profile) {
    redirect('/login');
  }

  const templates = await db
    .select()
    .from(qrTemplates)
    .where(or(eq(qrTemplates.isPublic, true), eq(qrTemplates.userId, user.profile.id)))
    .orderBy(desc(qrTemplates.isSystem), asc(qrTemplates.name));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="text-muted-foreground">
            Browse QR design templates, or save your own from the designer.
          </p>
        </div>
        <Button asChild>
          <Link href="/templates/builder">
            <Paintbrush className="size-4" />
            Design from scratch
          </Link>
        </Button>
      </div>
      <TemplateGallery templates={templates} currentUserProfileId={user.profile.id} />
    </div>
  );
}
