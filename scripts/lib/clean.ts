import { inArray, like, or } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { db } from '../../src/lib/db';
import {
  activityLog,
  folders,
  pageTemplates,
  qrCodes,
  qrTemplates,
  uploadedFiles,
  userProfiles,
} from '../../src/lib/db/schema';
import { QA_PREFIX, TEST_USERS } from '../seed-data/constants';
import { adminClient } from './qa-env';

const UPLOADS_BUCKET = 'uploads';

export async function findTestProfileIds(): Promise<string[]> {
  const rows = await db
    .select({ id: userProfiles.id })
    .from(userProfiles)
    .where(inArray(userProfiles.email, TEST_USERS.map((user) => user.email)));
  return rows.map((row) => row.id);
}

export interface CleanCounts {
  qrCodes: number;
  pages: number;
  qrTemplates: number;
  folders: number;
  files: number;
  activity: number;
}

/**
 * Removes seeded content, children first: scan events (cascade with their QR
 * codes), QR codes, pages, templates, folders, uploaded files, activity. Only
 * rows owned by the test users or named "[QA] ..." are touched, and system
 * rows are never deleted.
 */
export async function removeQaData(): Promise<CleanCounts> {
  const profileIds = await findTestProfileIds();
  const namePattern = `${QA_PREFIX}%`;
  const owned = (column: AnyPgColumn) => (profileIds.length > 0 ? inArray(column, profileIds) : undefined);

  const qr = await db
    .delete(qrCodes)
    .where(or(like(qrCodes.name, namePattern), owned(qrCodes.userId)))
    .returning({ id: qrCodes.id });

  const pages = await db
    .delete(pageTemplates)
    .where(or(like(pageTemplates.name, namePattern), owned(pageTemplates.userId)))
    .returning({ id: pageTemplates.id });

  const templates = await db
    .delete(qrTemplates)
    .where(or(like(qrTemplates.name, namePattern), owned(qrTemplates.userId)))
    .returning({ id: qrTemplates.id });

  const foldersRemoved = await db
    .delete(folders)
    .where(or(like(folders.name, namePattern), owned(folders.userId)))
    .returning({ id: folders.id });

  const files =
    profileIds.length > 0
      ? await db
          .delete(uploadedFiles)
          .where(inArray(uploadedFiles.userId, profileIds))
          .returning({ path: uploadedFiles.storagePath })
      : [];
  if (files.length > 0) {
    const { error } = await adminClient()
      .storage.from(UPLOADS_BUCKET)
      .remove(files.map((file) => file.path));
    if (error) console.error('Could not remove seeded files from storage:', error.message);
  }

  const activity = await db
    .delete(activityLog)
    .where(or(like(activityLog.entityName, namePattern), owned(activityLog.userId)))
    .returning({ id: activityLog.id });

  return {
    qrCodes: qr.length,
    pages: pages.length,
    qrTemplates: templates.length,
    folders: foldersRemoved.length,
    files: files.length,
    activity: activity.length,
  };
}
