import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { getOwnedPage } from '@/lib/pages/get-owned-page';
import { buildPublishedUrl } from '@/lib/pages/page-status';
import { savePageShortCode } from '@/lib/pages/page-slug';
import { SlugPageSchema } from '@/lib/pages/schemas';
import { checkRequestedSlug, isUniqueViolation, SLUG_TAKEN_RESPONSE } from '@/lib/slugs/slugs';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Gives a page a new link name (`/p/<name>`). The old name keeps forwarding to the page,
 * so links that were already shared or printed keep working.
 */
export async function PUT(request: Request, { params }: RouteContext): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { id } = await params;
  const owned = await getOwnedPage(id);
  if (!owned.ok) return owned.response;
  const { page } = owned;

  const parsed = SlugPageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Enter a link name', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const requested = await checkRequestedSlug('page', parsed.data.slug, id);
  if (!requested.ok) return requested.response;
  const shortCode = requested.slug;
  if (!shortCode) {
    return Response.json({ error: 'Enter a link name', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  if (shortCode !== page.shortCode) {
    try {
      await savePageShortCode(id, page.shortCode, shortCode);
    } catch (error) {
      if (isUniqueViolation(error)) return SLUG_TAKEN_RESPONSE();
      throw error;
    }

    await logActivity({
      userId: user.profile.id,
      action: 'page.updated',
      entityType: 'page',
      entityId: id,
      entityName: page.name,
      details: { linkRenamedFrom: page.shortCode, linkRenamedTo: shortCode },
    });
  }

  return Response.json({ shortCode, url: buildPublishedUrl(shortCode) });
}
