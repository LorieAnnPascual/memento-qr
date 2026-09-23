import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { uploadedFiles } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { MediaLibrary } from '@/components/media/media-library';

export default async function MediaPage() {
  const user = await getCurrentUser();

  if (!user?.profile) {
    redirect('/login');
  }

  const files = await db
    .select()
    .from(uploadedFiles)
    .where(eq(uploadedFiles.userId, user.profile.id))
    .orderBy(desc(uploadedFiles.createdAt));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Media</h1>
        <p className="text-muted-foreground">
          Logos and card backgrounds you&apos;ve uploaded. Deleting a file here removes it everywhere
          it&apos;s used.
        </p>
      </div>
      <MediaLibrary initialFiles={files} />
    </div>
  );
}
