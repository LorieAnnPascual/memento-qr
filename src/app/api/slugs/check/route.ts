import { z } from 'zod';

import { getCurrentUser } from '@/lib/auth/get-current-user';
import { normalizeSlug, slugProblem } from '@/lib/slugs/slug';
import { isSlugAvailable } from '@/lib/slugs/slugs';

const QuerySchema = z.object({
  kind: z.enum(['qr', 'page']),
  slug: z.string().max(100),
  excludeId: z.string().uuid().optional(),
});

/**
 * Live feedback while someone types a link name: what it will be cleaned up to, whether
 * it is allowed, and whether somebody else already has it. The item being renamed
 * (`excludeId`) is allowed to keep its own names.
 */
export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const parsed = QuerySchema.safeParse({
    kind: params.get('kind'),
    slug: params.get('slug') ?? '',
    excludeId: params.get('excludeId') ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const slug = normalizeSlug(parsed.data.slug);
  const problem = slugProblem(slug);
  if (problem) return Response.json({ slug, valid: false, available: false, error: problem });

  const available = await isSlugAvailable(parsed.data.kind, slug, parsed.data.excludeId);
  return Response.json({ slug, valid: true, available, error: available ? null : 'That link name is already taken.' });
}
