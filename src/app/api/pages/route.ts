import { and, desc, eq, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import { pageTemplates } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { CreatePageSchema } from '@/lib/pages/schemas';
import { BLANK_PAGE } from '@/lib/pages/templates';

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const category = new URL(request.url).searchParams.get('category');
  const own = eq(pageTemplates.userId, user.profile.id);
  const where = category ? and(own, eq(pageTemplates.category, category)) : own;

  const items = await db.select().from(pageTemplates).where(where).orderBy(desc(pageTemplates.updatedAt));

  return Response.json({ items });
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = CreatePageSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid page data', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  let puckData: unknown = data.puckData ?? BLANK_PAGE;
  let category: string = data.category;

  if (data.fromTemplateId) {
    const [source] = await db
      .select()
      .from(pageTemplates)
      .where(
        and(
          eq(pageTemplates.id, data.fromTemplateId),
          or(eq(pageTemplates.isPublic, true), eq(pageTemplates.userId, user.profile.id)),
        ),
      )
      .limit(1);

    if (!source) {
      return Response.json({ error: 'Template not found', code: 'TEMPLATE_NOT_FOUND' }, { status: 404 });
    }

    puckData = source.puckData;
    if (!body?.category) category = source.category;
  }

  const [created] = await db
    .insert(pageTemplates)
    .values({
      userId: user.profile.id,
      name: data.name,
      description: data.description,
      category,
      puckData,
      // A page starts private: a duplicate of a public template shouldn't
      // silently appear in everyone's gallery.
      isPublic: false,
      isSystem: false,
    })
    .returning();

  await logActivity({
    userId: user.profile.id,
    action: 'page.created',
    entityType: 'page',
    entityId: created.id,
    entityName: created.name,
    details: data.fromTemplateId ? { fromTemplateId: data.fromTemplateId } : undefined,
  });

  return Response.json(created, { status: 201 });
}
