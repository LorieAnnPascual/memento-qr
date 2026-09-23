import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { folders, type Folder } from '@/lib/db/schema';

/** Returns the folder if it exists and belongs to this user, otherwise null. */
export async function getOwnedFolder(folderId: string, profileId: string): Promise<Folder | null> {
  const [folder] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, profileId)))
    .limit(1);

  return folder ?? null;
}
