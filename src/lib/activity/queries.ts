import { and, count, desc, eq, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { activityLog, userProfiles } from '@/lib/db/schema';

export const ACTIVITY_PAGE_SIZE = 50;

export const ACTIVITY_FILTERS = ['all', 'qr', 'page', 'folder', 'template', 'export'] as const;
export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];

export interface ActivityRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  details: unknown;
  createdAt: Date;
  actorName: string | null;
  actorEmail: string | null;
}

export function parseActivityFilter(value: string | undefined): ActivityFilter {
  return ACTIVITY_FILTERS.find((filter) => filter === value) ?? 'all';
}

/** Team-wide activity, newest first. */
export async function getActivityPage(
  page: number,
  filter: ActivityFilter,
): Promise<{ rows: ActivityRow[]; total: number }> {
  const where: SQL | undefined = filter === 'all' ? undefined : and(eq(activityLog.entityType, filter));

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: activityLog.id,
        action: activityLog.action,
        entityType: activityLog.entityType,
        entityId: activityLog.entityId,
        entityName: activityLog.entityName,
        details: activityLog.details,
        createdAt: activityLog.createdAt,
        actorName: userProfiles.fullName,
        actorEmail: userProfiles.email,
      })
      .from(activityLog)
      .leftJoin(userProfiles, eq(activityLog.userId, userProfiles.id))
      .where(where)
      .orderBy(desc(activityLog.createdAt))
      .limit(ACTIVITY_PAGE_SIZE)
      .offset((Math.max(1, page) - 1) * ACTIVITY_PAGE_SIZE),
    db.select({ total: count() }).from(activityLog).where(where),
  ]);

  return { rows, total };
}
