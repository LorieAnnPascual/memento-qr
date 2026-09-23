/**
 * Removes everything the QA seed created: QA content first, then the test
 * users' profiles and their Supabase Auth accounts. System templates and real
 * team data are never touched.
 *
 *   pnpm db:teardown
 */
import './lib/load-env';
import { inArray } from 'drizzle-orm';

import { db } from '../src/lib/db';
import { userProfiles } from '../src/lib/db/schema';
import { adminClient, assertSafeToRun } from './lib/qa-env';
import { removeQaData } from './lib/clean';
import { TEST_USERS } from './seed-data/constants';

async function main(): Promise<void> {
  assertSafeToRun();

  const counts = await removeQaData();

  const profiles = await db
    .delete(userProfiles)
    .where(inArray(userProfiles.email, TEST_USERS.map((user) => user.email)))
    .returning({ authId: userProfiles.authId });

  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`Could not list auth users: ${error.message}`);

  let authRemoved = 0;
  for (const user of data.users.filter((u) => TEST_USERS.some((t) => t.email === u.email))) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw new Error(`Could not delete ${user.email}: ${deleteError.message}`);
    authRemoved++;
  }

  console.log('QA teardown complete:');
  console.log(`  QR codes ${counts.qrCodes}, pages ${counts.pages}, QR templates ${counts.qrTemplates}, folders ${counts.folders}`);
  console.log(`  files ${counts.files}, activity entries ${counts.activity}`);
  console.log(`  profiles ${profiles.length}, auth users ${authRemoved}`);
}

main()
  .catch((error: unknown) => {
    console.error('Teardown failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
