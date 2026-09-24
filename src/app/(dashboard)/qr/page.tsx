import { redirect } from 'next/navigation';
import { and, asc, count, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { folders, qrCodes } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { getTeamMembers } from '@/lib/team/members';
import { QRCodeList } from '@/components/qr/qr-code-list';

const PAGE_SIZE = 20;

const UUID = /^[0-9a-f-]{36}$/i;

export default async function QRListPage({ searchParams }: PageProps<'/qr'>) {
  const user = await getCurrentUser();

  if (!user?.profile) {
    redirect('/login');
  }

  // /qr?folder=<id> (from search results) opens the list already filtered to that folder.
  const { folder } = await searchParams;
  const folderParam = Array.isArray(folder) ? folder[0] : folder;
  const initialFolder = folderParam && UUID.test(folderParam) ? folderParam : undefined;

  const where = initialFolder
    ? and(isNull(qrCodes.deletedAt), eq(qrCodes.folderId, initialFolder))
    : isNull(qrCodes.deletedAt);

  const [items, [{ total }], userFolders, members] = await Promise.all([
    db.select().from(qrCodes).where(where).orderBy(desc(qrCodes.createdAt)).limit(PAGE_SIZE),
    db.select({ total: count() }).from(qrCodes).where(where),
    db
      .select({ id: folders.id, name: folders.name })
      .from(folders)
      .orderBy(asc(folders.name)),
    getTeamMembers(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">QR Codes</h1>
        <p className="text-muted-foreground">Everyone&apos;s saved QR codes. Hand one to a teammate, or check that it still works.</p>
      </div>
      <QRCodeList
        initialItems={items}
        initialTotal={total}
        pageSize={PAGE_SIZE}
        initialFolders={userFolders}
        initialFolder={initialFolder}
        members={members}
      />
    </div>
  );
}
