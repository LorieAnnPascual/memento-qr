import { timingSafeEqual } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Called daily by Vercel Cron (see vercel.json). Supabase's free tier pauses a
 * project after a week without activity; one tiny query keeps it awake.
 * Vercel sends `Authorization: Bearer <CRON_SECRET>`; anything else is refused.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;

  // Never fall open: without a configured secret nobody may call this.
  if (!secret) {
    return Response.json({ error: 'Cron is not configured', code: 'CRON_NOT_CONFIGURED' }, { status: 503 });
  }

  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ') || !secretsMatch(header.slice('Bearer '.length), secret)) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, at: new Date().toISOString() });
  } catch (error) {
    console.error('Keep-alive query failed:', error);
    return Response.json({ error: 'Database unreachable', code: 'DB_UNREACHABLE' }, { status: 500 });
  }
}
