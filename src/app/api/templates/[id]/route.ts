import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { qrTemplates } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { UpdateTemplateSchema } from '@/lib/qr/schemas';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;

  const [template] = await db.select().from(qrTemplates).where(eq(qrTemplates.id, id)).limit(1);

  if (!template || (!template.isPublic && template.userId !== user.profile.id)) {
    return Response.json({ error: 'Template not found', code: 'TEMPLATE_NOT_FOUND' }, { status: 404 });
  }

  return Response.json(template);
}

export async function PUT(request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;

  const [existing] = await db.select().from(qrTemplates).where(eq(qrTemplates.id, id)).limit(1);

  if (!existing) {
    return Response.json({ error: 'Template not found', code: 'TEMPLATE_NOT_FOUND' }, { status: 404 });
  }

  if (existing.isSystem || existing.userId !== user.profile.id) {
    return Response.json(
      { error: 'You can only edit your own templates', code: 'FORBIDDEN' },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = UpdateTemplateSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid template data', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const [updated] = await db
    .update(qrTemplates)
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.styleConfig !== undefined && { styleConfig: data.styleConfig }),
      updatedAt: new Date(),
    })
    .where(eq(qrTemplates.id, id))
    .returning();

  await logActivity({
    userId: user.profile.id,
    action: 'template.updated',
    entityType: 'template',
    entityId: id,
    entityName: updated.name,
    collapseWithinMs: 10 * 60 * 1000,
  });

  return Response.json(updated);
}

export async function DELETE(_request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;

  const [existing] = await db.select().from(qrTemplates).where(eq(qrTemplates.id, id)).limit(1);

  if (!existing) {
    return Response.json({ error: 'Template not found', code: 'TEMPLATE_NOT_FOUND' }, { status: 404 });
  }

  if (existing.isSystem || existing.userId !== user.profile.id) {
    return Response.json(
      { error: 'You can only delete your own templates', code: 'FORBIDDEN' },
      { status: 403 },
    );
  }

  await db.delete(qrTemplates).where(eq(qrTemplates.id, id));

  await logActivity({
    userId: user.profile.id,
    action: 'template.deleted',
    entityType: 'template',
    entityId: id,
    entityName: existing.name,
  });

  return new Response(null, { status: 204 });
}
