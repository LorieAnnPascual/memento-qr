/**
 * QA seed: creates 3 test users and a known set of QR codes, pages, scans and
 * files so tests start from the same state every time.
 *
 *   pnpm db:seed        create / refresh the QA data (safe to run twice)
 *   pnpm db:teardown    remove all of it, including the test users
 *
 * Everything is tagged "[QA]" or owned by an @memento.local test user.
 */
import './lib/load-env';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '../src/lib/db';
import {
  folders,
  pageTemplates,
  qrCodes,
  qrTemplates,
  scanEvents,
  uploadedFiles,
  userProfiles,
} from '../src/lib/db/schema';
import { adminClient, assertSafeToRun } from './lib/qa-env';
import { removeQaData } from './lib/clean';
import { QA_PREFIX, TEST_PASSWORD, TEST_USERS, type TestUserKey } from './seed-data/constants';
import { SEED_FILES } from './seed-data/files';
import { SEED_PAGES } from './seed-data/pages';
import { buildDynamicQRCodes, STATIC_QR_CODES, VIEWER_PRIVATE_QR } from './seed-data/qr-codes';
import { generateScans } from './seed-data/scans';

const UPLOADS_BUCKET = 'uploads';

async function ensureUsers(): Promise<Record<TestUserKey, string>> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`Could not list auth users: ${error.message}`);

  const profileIds = {} as Record<TestUserKey, string>;

  for (const testUser of TEST_USERS) {
    let authUser = data.users.find((user) => user.email === testUser.email);

    if (authUser) {
      const { error: updateError } = await admin.auth.admin.updateUserById(authUser.id, {
        password: TEST_PASSWORD,
        email_confirm: true,
      });
      if (updateError) throw new Error(`Could not refresh ${testUser.email}: ${updateError.message}`);
    } else {
      const created = await admin.auth.admin.createUser({
        email: testUser.email,
        password: TEST_PASSWORD,
        email_confirm: true,
      });
      if (created.error || !created.data.user) {
        throw new Error(`Could not create ${testUser.email}: ${created.error?.message}`);
      }
      authUser = created.data.user;
    }

    const [existing] = await db.select().from(userProfiles).where(eq(userProfiles.authId, authUser.id)).limit(1);
    if (existing) {
      await db
        .update(userProfiles)
        .set({ email: testUser.email, fullName: testUser.fullName, role: testUser.role })
        .where(eq(userProfiles.id, existing.id));
      profileIds[testUser.key] = existing.id;
    } else {
      const [created] = await db
        .insert(userProfiles)
        .values({ authId: authUser.id, email: testUser.email, fullName: testUser.fullName, role: testUser.role })
        .returning({ id: userProfiles.id });
      profileIds[testUser.key] = created.id;
    }
  }

  return profileIds;
}

async function main(): Promise<void> {
  assertSafeToRun();
  const now = new Date();

  // Idempotent: clear what a previous run made, keep the users.
  await removeQaData();
  const owners = await ensureUsers();

  // System QR templates are seeded separately (pnpm db:seed-templates); just confirm they exist.
  const systemTemplates = await db.select({ id: qrTemplates.id }).from(qrTemplates).where(eq(qrTemplates.isSystem, true));
  if (systemTemplates.length < 6) {
    console.warn(`Only ${systemTemplates.length} system QR templates found; run "pnpm db:seed-templates".`);
  }
  const systemPages = await db.select({ id: pageTemplates.id }).from(pageTemplates).where(eq(pageTemplates.isSystem, true));
  if (systemPages.length < 5) {
    console.warn(`Only ${systemPages.length} system page templates found; run "pnpm db:seed-page-templates".`);
  }

  // Folder so folder features have something to show.
  const [folder] = await db
    .insert(folders)
    .values({ userId: owners.editor, name: `${QA_PREFIX} Folder` })
    .returning({ id: folders.id });

  // QR codes
  const allQr = [...STATIC_QR_CODES, ...buildDynamicQRCodes(now), VIEWER_PRIVATE_QR];
  const insertedQr = await db
    .insert(qrCodes)
    .values(
      allQr.map((qr, index) => ({
        userId: owners[qr.owner],
        name: qr.name,
        qrType: qr.qrType,
        payload: qr.payload,
        payloadFields: qr.payloadFields,
        styleConfig: qr.styleConfig,
        isDynamic: qr.isDynamic,
        shortCode: qr.shortCode,
        targetUrl: qr.targetUrl,
        isPaused: qr.isPaused,
        expiresAt: qr.expiresAt,
        scanLimit: qr.scanLimit,
        tags: qr.tags,
        // Spread staggered creation times so list ordering is deterministic.
        createdAt: new Date(now.getTime() - (allQr.length - index) * 60_000),
        folderId: index < 2 ? folder.id : null,
      })),
    )
    .returning({ id: qrCodes.id, shortCode: qrCodes.shortCode });

  // Scan events, then make scan_count match them exactly.
  const idByCode = new Map(insertedQr.filter((q) => q.shortCode).map((q) => [q.shortCode!, q.id]));
  const scans = generateScans(now);
  await db.insert(scanEvents).values(
    scans.map((scan) => ({
      qrCodeId: idByCode.get(scan.shortCode)!,
      ipHash: scan.ipHash,
      userAgent: scan.userAgent,
      referrer: scan.referrer,
      deviceType: scan.deviceType,
      browser: scan.browser,
      os: scan.os,
      country: scan.country,
      countryCode: scan.countryCode,
      region: scan.region,
      city: scan.city,
      latitude: scan.latitude,
      longitude: scan.longitude,
      scannedAt: scan.scannedAt,
    })),
  );
  const dynamicIds = [...idByCode.values()];
  await db
    .update(qrCodes)
    .set({ scanCount: sql`(select count(*) from ${scanEvents} where ${scanEvents.qrCodeId} = ${qrCodes.id})` })
    .where(inArray(qrCodes.id, dynamicIds));

  // Landing pages
  await db.insert(pageTemplates).values(
    SEED_PAGES.map((page) => ({
      userId: owners.editor,
      name: page.name,
      description: page.description,
      category: page.category,
      puckData: page.puckData,
      isPublic: false,
      isSystem: false,
      isPublished: page.isPublished,
      shortCode: page.shortCode,
      publishedAt: page.isPublished ? new Date(now.getTime() - 48 * 3_600_000) : null,
      expiresAt: page.expiresInHours === null ? null : new Date(now.getTime() + page.expiresInHours * 3_600_000),
    })),
  );

  // Uploaded files (real images in storage, so the media library and pickers show pictures)
  const storage = adminClient().storage.from(UPLOADS_BUCKET);
  for (const file of SEED_FILES) {
    const storagePath = `${owners.editor}/qa-${file.fileName}`;
    const { error } = await storage.upload(storagePath, file.data, { contentType: file.mimeType, upsert: true });
    if (error) throw new Error(`Could not upload ${file.fileName}: ${error.message}`);

    await db.insert(uploadedFiles).values({
      userId: owners.editor,
      fileName: file.fileName,
      fileSize: file.data.length,
      mimeType: file.mimeType,
      storagePath,
      publicUrl: storage.getPublicUrl(storagePath).data.publicUrl,
    });
  }

  const [{ count: qrCount }] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(qrCodes)
    .where(and(inArray(qrCodes.userId, Object.values(owners))));

  console.log('QA seed complete:');
  console.log(`  users        ${TEST_USERS.map((u) => u.email).join(', ')} (password: ${TEST_PASSWORD})`);
  console.log(`  QR codes     ${qrCount} (10 static, 5 dynamic, 1 owned by the viewer)`);
  console.log(`  scan events  ${scans.length}`);
  console.log(`  pages        ${SEED_PAGES.length}`);
  console.log(`  files        ${SEED_FILES.length}`);
  console.log('Remove everything with: pnpm db:teardown');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
