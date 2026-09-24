import { and, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { folders, pageTemplates, qrCodes, qrTemplates } from '@/lib/db/schema';

import type { ParsedBackup } from './parse-backup';

export interface RestoreSummary {
  added: Record<'folders' | 'qrCodes' | 'qrTemplates' | 'pages', number>;
  skipped: Record<'folders' | 'qrCodes' | 'qrTemplates' | 'pages', number>;
  invalid: number;
}

/**
 * Adds what a backup contains and the user does not already have. Nothing that
 * exists is changed or overwritten. Everything restored belongs to `userId`,
 * even when the file was a whole-team export. Scan history is not restored, so
 * restored codes start their scan count from zero.
 */
export async function restoreBackup(userId: string, backup: ParsedBackup): Promise<RestoreSummary> {
  return db.transaction(async (tx) => {
    const summary: RestoreSummary = {
      added: { folders: 0, qrCodes: 0, qrTemplates: 0, pages: 0 },
      skipped: { folders: 0, qrCodes: 0, qrTemplates: 0, pages: 0 },
      invalid: backup.invalid,
    };

    // --- folders (matched by name); remember old id -> id to use now
    const folderIds = new Map<string, string>();
    const existingFolders = await tx.select().from(folders).where(eq(folders.userId, userId));
    const folderByName = new Map(existingFolders.map((row) => [row.name, row.id]));
    for (const folder of backup.folders) {
      const existing = folderByName.get(folder.name);
      if (existing) {
        folderIds.set(folder.id, existing);
        summary.skipped.folders += 1;
        continue;
      }
      const [created] = await tx.insert(folders).values({ userId, name: folder.name }).returning();
      folderByName.set(folder.name, created.id);
      folderIds.set(folder.id, created.id);
      summary.added.folders += 1;
    }

    // --- QR templates (matched by name)
    const templateIds = new Map<string, string>();
    const existingTemplates = await tx
      .select()
      .from(qrTemplates)
      .where(and(eq(qrTemplates.userId, userId), eq(qrTemplates.isSystem, false)));
    const templateByName = new Map(existingTemplates.map((row) => [row.name, row.id]));
    for (const template of backup.qrTemplates) {
      const existing = templateByName.get(template.name);
      if (existing) {
        if (template.id) templateIds.set(template.id, existing);
        summary.skipped.qrTemplates += 1;
        continue;
      }
      const [created] = await tx
        .insert(qrTemplates)
        .values({
          userId,
          name: template.name,
          description: template.description ?? null,
          category: template.category,
          styleConfig: template.styleConfig,
          isSystem: false,
        })
        .returning();
      templateByName.set(template.name, created.id);
      if (template.id) templateIds.set(template.id, created.id);
      summary.added.qrTemplates += 1;
    }

    // --- QR codes: a short link that exists (anyone's) or an identical code of yours is skipped
    const codes = backup.qrCodes;
    const shortCodes = codes.map((qr) => qr.shortCode).filter((code): code is string => Boolean(code));
    const takenShortCodes = new Set(
      shortCodes.length === 0
        ? []
        : (await tx.select({ code: qrCodes.shortCode }).from(qrCodes).where(inArray(qrCodes.shortCode, shortCodes))).map(
            (row) => row.code,
          ),
    );
    const mine = await tx
      .select({ name: qrCodes.name, qrType: qrCodes.qrType, payload: qrCodes.payload })
      .from(qrCodes)
      .where(and(eq(qrCodes.userId, userId), isNull(qrCodes.deletedAt)));
    const identity = (name: string, qrType: string, payload: string): string => JSON.stringify([name, qrType, payload]);
    const haveIdentity = new Set(mine.map((row) => identity(row.name, row.qrType, row.payload)));

    for (const qr of codes) {
      const key = identity(qr.name, qr.qrType, qr.payload);
      const shortCode = qr.isDynamic ? (qr.shortCode ?? null) : null;
      if (haveIdentity.has(key) || (shortCode && takenShortCodes.has(shortCode))) {
        summary.skipped.qrCodes += 1;
        continue;
      }
      // A dynamic code without a short link would encode nothing useful; restore it as static.
      const isDynamic = qr.isDynamic && Boolean(shortCode);
      await tx.insert(qrCodes).values({
        userId,
        name: qr.name,
        qrType: qr.qrType,
        payload: qr.payload,
        payloadFields: qr.payloadFields ?? null,
        isDynamic,
        shortCode: isDynamic ? shortCode : null,
        targetUrl: isDynamic ? (qr.targetUrl ?? null) : null,
        styleConfig: qr.styleConfig,
        templateId: qr.templateId ? (templateIds.get(qr.templateId) ?? null) : null,
        folderId: qr.folderId ? (folderIds.get(qr.folderId) ?? null) : null,
        isPaused: qr.isPaused,
        expiresAt: qr.expiresAt,
        scanLimit: qr.scanLimit ?? null,
        tags: qr.tags ?? null,
        notes: qr.notes ?? null,
      });
      haveIdentity.add(key);
      if (shortCode) takenShortCodes.add(shortCode);
      summary.added.qrCodes += 1;
    }

    // --- pages (matched by name); their public link is kept only if it is still free
    const existingPages = await tx
      .select({ name: pageTemplates.name })
      .from(pageTemplates)
      .where(and(eq(pageTemplates.userId, userId), eq(pageTemplates.isSystem, false)));
    const havePage = new Set(existingPages.map((row) => row.name));
    const pageCodes = backup.pages.map((page) => page.shortCode).filter((code): code is string => Boolean(code));
    const takenPageCodes = new Set(
      pageCodes.length === 0
        ? []
        : (
            await tx
              .select({ code: pageTemplates.shortCode })
              .from(pageTemplates)
              .where(inArray(pageTemplates.shortCode, pageCodes))
          ).map((row) => row.code),
    );

    for (const page of backup.pages) {
      if (havePage.has(page.name)) {
        summary.skipped.pages += 1;
        continue;
      }
      const keepLink = Boolean(page.shortCode) && !takenPageCodes.has(page.shortCode as string);
      await tx.insert(pageTemplates).values({
        userId,
        name: page.name,
        description: page.description ?? null,
        category: page.category,
        puckData: page.puckData,
        isSystem: false,
        isPublished: keepLink && page.isPublished,
        shortCode: keepLink ? page.shortCode : null,
        publishedAt: keepLink && page.isPublished ? new Date() : null,
        expiresAt: page.expiresAt,
      });
      havePage.add(page.name);
      if (keepLink) takenPageCodes.add(page.shortCode as string);
      summary.added.pages += 1;
    }

    return summary;
  });
}
