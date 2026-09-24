import { timingSafeEqual } from 'node:crypto';

import { runLinkChecks } from '@/lib/monitoring/link-health';

export const maxDuration = 60;

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Called daily by Vercel Cron (see vercel.json): checks dynamic QR codes for
 * paused/expired/limit problems and broken destinations, and records the result
 * on each code. Vercel sends `Authorization: Bearer <CRON_SECRET>`.
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
    const summary = await runLinkChecks();
    return Response.json({ ok: true, at: new Date().toISOString(), summary });
  } catch (error) {
    console.error('Link check run failed:', error);
    return Response.json({ error: 'Link check failed', code: 'LINK_CHECK_FAILED' }, { status: 500 });
  }
}
