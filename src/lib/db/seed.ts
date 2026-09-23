/**
 * Creates a user_profiles row for an existing Supabase Auth user.
 *
 * Team members are created manually in the Supabase dashboard (Authentication
 * → Users → Add user) — there is no public sign-up. Run this once per new
 * team member to link their auth account to a profile row:
 *
 *   pnpm db:seed-user -- --auth-id=<uuid> --email=name@example.com --name="Full Name" --role=admin
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

async function main(): Promise<void> {
  // Imported dynamically so `config()` above runs before `./index` reads DATABASE_URL.
  const [{ eq }, { db }, { userProfiles }] = await Promise.all([
    import('drizzle-orm'),
    import('./index'),
    import('./schema'),
  ]);

  const authId = getArg('auth-id');
  const email = getArg('email');
  const fullName = getArg('name');
  const role = getArg('role') ?? 'member';

  if (!authId || !email) {
    console.error('Usage: pnpm db:seed-user -- --auth-id=<uuid> --email=<email> [--name=<name>] [--role=admin|member]');
    process.exit(1);
  }

  const [existing] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.authId, authId))
    .limit(1);

  if (existing) {
    console.log(`Profile already exists for ${email} (${existing.id})`);
    return;
  }

  const [created] = await db
    .insert(userProfiles)
    .values({ authId, email, fullName, role })
    .returning();

  console.log(`Created profile for ${email} (${created.id})`);
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
