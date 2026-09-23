import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { userProfiles } from '@/lib/db/schema';
import { createClient } from '@/lib/auth/supabase-server';

const UpdateProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
});

export async function PUT(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = UpdateProfileSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid profile data', code: 'VALIDATION_ERROR' },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(userProfiles)
    .set({ fullName: parsed.data.fullName, updatedAt: new Date() })
    .where(eq(userProfiles.authId, user.id))
    .returning();

  if (!updated) {
    return Response.json(
      { error: 'Profile not found', code: 'PROFILE_NOT_FOUND' },
      { status: 404 },
    );
  }

  return Response.json(updated);
}
