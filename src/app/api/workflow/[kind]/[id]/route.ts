import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { pageTemplates, qrCodes, userProfiles } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { displayName } from '@/lib/team/display-name';
import { WorkflowSchema } from '@/lib/workflow/schemas';

type RouteContext = { params: Promise<{ kind: string; id: string }> };

/**
 * Handoff details for a QR code or a page: who it is assigned to, the next
 * action, an internal note and an optional checklist. Anyone on the team can
 * change these; the activity log records who did.
 */
export async function PUT(request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { kind, id } = await params;

  if (kind !== 'qr' && kind !== 'page') {
    return Response.json({ error: 'Unknown item type', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const parsed = WorkflowSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid handoff details', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  let assigneeName: string | null = null;
  if (data.assignedTo) {
    const [assignee] = await db
      .select({ fullName: userProfiles.fullName, email: userProfiles.email })
      .from(userProfiles)
      .where(eq(userProfiles.id, data.assignedTo))
      .limit(1);

    if (!assignee) {
      return Response.json({ error: 'Teammate not found', code: 'USER_NOT_FOUND' }, { status: 404 });
    }
    assigneeName = displayName(assignee);
  }

  const changes = {
    ...(data.assignedTo !== undefined && { assignedTo: data.assignedTo }),
    ...(data.nextAction !== undefined && { nextAction: data.nextAction || null }),
    ...(data.notes !== undefined && { notes: data.notes || null }),
    ...(data.checklist !== undefined && { checklist: data.checklist }),
    updatedAt: new Date(),
    updatedBy: user.profile.id,
  };

  const table = kind === 'qr' ? qrCodes : pageTemplates;
  const [existing] = await db.select().from(table).where(eq(table.id, id)).limit(1);
  const removed = existing && 'deletedAt' in existing && existing.deletedAt;
  const builtIn = existing && 'isSystem' in existing && existing.isSystem;

  if (!existing || removed || builtIn) {
    return Response.json({ error: 'Item not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  const [updated] = await db.update(table).set(changes).where(eq(table.id, id)).returning();

  await logActivity({
    userId: user.profile.id,
    action: kind === 'qr' ? 'qr.handoff' : 'page.handoff',
    entityType: kind,
    entityId: id,
    entityName: updated.name,
    details:
      data.assignedTo !== undefined
        ? { assignedToName: assigneeName, unassigned: data.assignedTo === null }
        : undefined,
    // Ticking checklist boxes shouldn't flood the log.
    collapseWithinMs: data.assignedTo === undefined ? 10 * 60 * 1000 : undefined,
  });

  return Response.json({
    assignedTo: updated.assignedTo,
    nextAction: updated.nextAction,
    notes: updated.notes,
    checklist: updated.checklist,
  });
}
