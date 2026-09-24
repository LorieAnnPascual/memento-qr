import { getCurrentUser } from '@/lib/auth/get-current-user';
import { isSearchable, searchWorkspace } from '@/lib/search/search';

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get('q') ?? '';

  if (!isSearchable(q)) {
    return Response.json(
      { error: 'Type at least 2 characters to search', code: 'QUERY_TOO_SHORT' },
      { status: 400 },
    );
  }

  return Response.json(await searchWorkspace(q));
}
