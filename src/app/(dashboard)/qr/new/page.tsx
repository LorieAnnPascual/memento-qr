import { asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { folders, qrTemplates } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import type { QRStyleConfig } from '@/lib/qr/generator';
import { QRDesigner } from '@/components/qr/qr-designer';

export default async function NewQRCodePage({ searchParams }: PageProps<'/qr/new'>) {
  const { template: templateId } = await searchParams;

  let initialStyle: QRStyleConfig | undefined;
  if (typeof templateId === 'string') {
    const [template] = await db
      .select({ styleConfig: qrTemplates.styleConfig })
      .from(qrTemplates)
      .where(eq(qrTemplates.id, templateId))
      .limit(1);
    initialStyle = template?.styleConfig as QRStyleConfig | undefined;
  }

  const user = await getCurrentUser();
  const userFolders = user?.profile
    ? await db
        .select({ id: folders.id, name: folders.name })
        .from(folders)
        .where(eq(folders.userId, user.profile.id))
        .orderBy(asc(folders.name))
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New QR Code</h1>
        <p className="text-muted-foreground">Choose a type and fill in its details.</p>
      </div>
      <QRDesigner initialStyle={initialStyle} folders={userFolders} />
    </div>
  );
}
