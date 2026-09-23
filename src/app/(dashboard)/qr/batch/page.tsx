import { redirect } from 'next/navigation';
import { asc, desc, eq, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import { folders, qrTemplates } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { BatchQRForm } from '@/components/qr/batch-qr-form';

export default async function BatchQRPage() {
  const user = await getCurrentUser();

  if (!user?.profile) {
    redirect('/login');
  }

  const [userFolders, templates] = await Promise.all([
    db
      .select({ id: folders.id, name: folders.name })
      .from(folders)
      .where(eq(folders.userId, user.profile.id))
      .orderBy(asc(folders.name)),
    db
      .select({ id: qrTemplates.id, name: qrTemplates.name, styleConfig: qrTemplates.styleConfig })
      .from(qrTemplates)
      .where(or(eq(qrTemplates.isPublic, true), eq(qrTemplates.userId, user.profile.id)))
      .orderBy(desc(qrTemplates.isSystem), asc(qrTemplates.name)),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Batch import</h1>
        <p className="text-muted-foreground">Create many QR codes at once from a spreadsheet.</p>
      </div>
      <BatchQRForm folders={userFolders} templates={templates} />
    </div>
  );
}
