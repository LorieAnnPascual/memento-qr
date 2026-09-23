import { notFound, redirect } from 'next/navigation';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { folders, qrCodes } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { QRDesigner } from '@/components/qr/qr-designer';

export default async function EditQRCodePage({ params }: PageProps<'/qr/[id]'>) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user?.profile) {
    redirect('/login');
  }

  const [qrCode] = await db
    .select()
    .from(qrCodes)
    .where(and(eq(qrCodes.id, id), eq(qrCodes.userId, user.profile.id), isNull(qrCodes.deletedAt)))
    .limit(1);

  if (!qrCode) {
    notFound();
  }

  const userFolders = await db
    .select({ id: folders.id, name: folders.name })
    .from(folders)
    .where(eq(folders.userId, user.profile.id))
    .orderBy(asc(folders.name));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Edit QR Code</h1>
          <p className="text-muted-foreground">{qrCode.name}</p>
        </div>
        {qrCode.isDynamic && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/qr/${qrCode.id}/analytics`}>View analytics</Link>
          </Button>
        )}
      </div>
      <QRDesigner initialQrCode={qrCode} folders={userFolders} />
    </div>
  );
}
