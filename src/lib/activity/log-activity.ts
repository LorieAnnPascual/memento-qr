import { and, desc, eq, gt } from 'drizzle-orm';

import { db } from '@/lib/db';
import { activityLog, type NewActivityLogEntry } from '@/lib/db/schema';

import type { ActivityAction } from './actions';

export interface ActivityInput {
  /** Who did it; null for something the system did (e.g. the daily link check). */
  userId: string | null;
  action: ActivityAction;
  entityType: 'qr' | 'page' | 'folder' | 'template' | 'export';
  entityId?: string | null;
  entityName?: string | null;
  details?: Record<string, unknown>;
  /**
   * When set, a repeat of the same action by the same person on the same item
   * within this window refreshes the existing entry instead of adding another.
   */
  collapseWithinMs?: number;
}

/**
 * Records something a team member did. This is bookkeeping: a failure to log
 * must never fail the action the user actually asked for.
 */
export async function logActivity(input: ActivityInput): Promise<void> {
  const entry: NewActivityLogEntry = {
    userId: input.userId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    entityName: input.entityName ?? null,
    details: input.details ?? null,
  };

  try {
    if (input.collapseWithinMs && input.entityId && input.userId) {
      const [recent] = await db
        .select({ id: activityLog.id })
        .from(activityLog)
        .where(
          and(
            eq(activityLog.userId, input.userId),
            eq(activityLog.action, input.action),
            eq(activityLog.entityId, input.entityId),
            gt(activityLog.createdAt, new Date(Date.now() - input.collapseWithinMs)),
          ),
        )
        .orderBy(desc(activityLog.createdAt))
        .limit(1);

      if (recent) {
        await db
          .update(activityLog)
          .set({ createdAt: new Date(), entityName: entry.entityName })
          .where(eq(activityLog.id, recent.id));
        return;
      }
    }

    await db.insert(activityLog).values(entry);
  } catch (error) {
    console.error('Activity log error:', error);
  }
}
