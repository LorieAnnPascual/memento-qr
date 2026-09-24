import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { folders, type Folder } from '@/lib/db/schema';

/** Returns the folder if it exists (folders are shared by the whole team), otherwise null. */
export async function getOwnedFolder(folderId: string): Promise<Folder | null> {
  const [folder] = await db
    .select()
    .from(folders)
    .where(eq(folders.id, folderId))
    .limit(1);

  return folder ?? null;
}
