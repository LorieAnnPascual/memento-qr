import { and, asc, desc, eq, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import { qrTemplates } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { CreateTemplateSchema } from '@/lib/qr/schemas';

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');

  const visibility = or(eq(qrTemplates.isPublic, true), eq(qrTemplates.userId, user.profile.id));
  const where = category ? and(visibility, eq(qrTemplates.category, category)) : visibility;

  const items = await db
    .select()
    .from(qrTemplates)
    .where(where)
    .orderBy(desc(qrTemplates.isSystem), asc(qrTemplates.name));

  return Response.json({ items });
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = CreateTemplateSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid template data', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const [created] = await db
    .insert(qrTemplates)
    .values({
      userId: user.profile.id,
      name: data.name,
      description: data.description,
      category: data.category,
      styleConfig: data.styleConfig,
      isPublic: true,
      isSystem: false,
    })
    .returning();

  await logActivity({
    userId: user.profile.id,
    action: 'template.created',
    entityType: 'template',
    entityId: created.id,
    entityName: created.name,
  });

  return Response.json(created, { status: 201 });
}
