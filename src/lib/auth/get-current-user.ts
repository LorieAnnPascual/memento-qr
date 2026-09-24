import { cache } from 'react';

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { userProfiles, type UserProfile } from '@/lib/db/schema';
import { createClient } from './supabase-server';

export interface CurrentUser {
  authId: string;
  email: string;
  profile: UserProfile | null;
}

/** Cached per request, so a layout and its page share one auth + profile lookup. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.authId, user.id))
    .limit(1);

  return {
    authId: user.id,
    email: user.email ?? '',
    profile: profile ?? null,
  };
});
