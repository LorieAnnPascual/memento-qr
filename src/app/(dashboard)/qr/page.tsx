import { redirect } from 'next/navigation';
import { and, asc, count, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { folders, qrCodes } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { QRCodeList } from '@/components/qr/qr-code-list';

const PAGE_SIZE = 20;

export default async function QRListPage() {
  const user = await getCurrentUser();

  if (!user?.profile) {
    redirect('/login');
  }

  const where = and(eq(qrCodes.userId, user.profile.id), isNull(qrCodes.deletedAt));

  const [items, [{ total }], userFolders] = await Promise.all([
    db.select().from(qrCodes).where(where).orderBy(desc(qrCodes.createdAt)).limit(PAGE_SIZE),
    db.select({ total: count() }).from(qrCodes).where(where),
    db
      .select({ id: folders.id, name: folders.name })
      .from(folders)
      .where(eq(folders.userId, user.profile.id))
      .orderBy(asc(folders.name)),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">QR Codes</h1>
        <p className="text-muted-foreground">All your saved QR codes.</p>
      </div>
      <QRCodeList initialItems={items} initialTotal={total} pageSize={PAGE_SIZE}
        initialFolders={userFolders}
      />
    </div>
  );
}
