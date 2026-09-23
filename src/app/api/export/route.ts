import { and, desc, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db';
import { activityLog, folders, pageTemplates, qrCodes, qrTemplates, scanEvents } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { backupFileName, buildBackup, MAX_BACKUP_SCAN_EVENTS } from '@/lib/export/build-backup';

/**
 * Downloads everything the user owns as one JSON file. Admins can also ask for
 * the whole team with `?scope=team`.
 */
export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const wantsTeam = new URL(request.url).searchParams.get('scope') === 'team';
  if (wantsTeam && user.profile.role !== 'admin') {
    return Response.json(
      { error: 'Only admins can export the whole team', code: 'FORBIDDEN' },
      { status: 403 },
    );
  }

  const profileId = user.profile.id;
  // Members export only their own rows; admins asking for the team get no owner filter.
  const mine = (column: AnyPgColumn): SQL | undefined => (wantsTeam ? undefined : eq(column, profileId));

  const [folderRows, qrRows, templateRows, pageRows, activityRows] = await Promise.all([
    db.select().from(folders).where(mine(folders.userId)),
    db
      .select()
      .from(qrCodes)
      .where(and(mine(qrCodes.userId), isNull(qrCodes.deletedAt))),
    db.select().from(qrTemplates).where(and(mine(qrTemplates.userId), eq(qrTemplates.isSystem, false))),
    db
      .select()
      .from(pageTemplates)
      .where(and(mine(pageTemplates.userId), eq(pageTemplates.isSystem, false))),
    db.select().from(activityLog).where(mine(activityLog.userId)).orderBy(desc(activityLog.createdAt)).limit(10_000),
  ]);

  const qrIds = qrRows.map((row) => row.id);
  const scanRows =
    qrIds.length === 0
      ? []
      : await db
          .select()
          .from(scanEvents)
          .where(inArray(scanEvents.qrCodeId, qrIds))
          .orderBy(desc(scanEvents.scannedAt))
          .limit(MAX_BACKUP_SCAN_EVENTS);

  const now = new Date();
  const backup = buildBackup(
    {
      scope: wantsTeam ? 'team' : 'mine',
      exportedBy: user.email,
      folders: folderRows,
      qrCodes: qrRows,
      qrTemplates: templateRows,
      pages: pageRows,
      scanEvents: scanRows,
      activity: activityRows,
    },
    now,
  );

  await logActivity({
    userId: profileId,
    action: 'data.exported',
    entityType: 'export',
    entityName: 'Backup',
    details: { scope: backup.scope, ...backup.counts },
  });

  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${backupFileName(now)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
