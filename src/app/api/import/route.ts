import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logActivity } from '@/lib/activity/log-activity';
import { parseBackup } from '@/lib/export/parse-backup';
import { restoreBackup } from '@/lib/export/restore-backup';

// Vercel rejects request bodies over 4.5 MB anyway; fail clearly before that.
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * Restores a backup file made by `GET /api/export`. Only adds what is missing
 * and always into the signed-in user's own account.
 */
export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();

  if (!user?.profile) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const text = await request.text().catch(() => '');
  if (text.length > MAX_BODY_BYTES) {
    return Response.json({ error: 'The backup file is too large to restore.', code: 'TOO_LARGE' }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return Response.json({ error: 'This file is not valid JSON.', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const parsed = parseBackup(json);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error, code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  try {
    const summary = await restoreBackup(user.profile.id, parsed.backup);

    await logActivity({
      userId: user.profile.id,
      action: 'data.imported',
      entityType: 'export',
      entityName: 'Backup',
      details: { added: summary.added, skipped: summary.skipped },
    });

    return Response.json(summary);
  } catch (error) {
    console.error('Backup restore error:', error);
    return Response.json({ error: 'Failed to restore the backup. Nothing was changed.', code: 'RESTORE_FAILED' }, { status: 500 });
  }
}
