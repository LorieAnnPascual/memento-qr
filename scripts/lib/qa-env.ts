import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

/**
 * The seed writes to whichever database `.env.local` points at, so refuse to
 * run when the app URL looks like a live site. Override deliberately with
 * QA_ALLOW_REMOTE=1 (for example, a dedicated test project behind a preview URL).
 */
export function assertSafeToRun(): void {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  let host = '';
  try {
    host = new URL(appUrl).hostname;
  } catch {
    throw new Error(`NEXT_PUBLIC_APP_URL is not a valid URL: "${appUrl}"`);
  }

  const isLocal = host === 'localhost' || host === '127.0.0.1';
  if (process.env.VERCEL_ENV === 'production') {
    throw new Error('Refusing to run: VERCEL_ENV is production.');
  }
  if (!isLocal && process.env.QA_ALLOW_REMOTE !== '1') {
    throw new Error(
      `Refusing to run: NEXT_PUBLIC_APP_URL (${host}) is not localhost. ` +
        'Set QA_ALLOW_REMOTE=1 only if this really is a test environment.',
    );
  }

  for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL']) {
    if (!process.env[name]) throw new Error(`${name} is not set in .env.local`);
  }
}

export function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
