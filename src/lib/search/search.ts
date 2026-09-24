import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { folders, pageTemplates, qrCodes, qrTemplates } from '@/lib/db/schema';

export const SEARCH_LIMIT_PER_GROUP = 8;
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 100;

export interface QrResult {
  id: string;
  name: string;
  qrType: string;
  isDynamic: boolean;
  isPaused: boolean;
  assignedTo: string | null;
  nextAction: string | null;
}

export interface PageResult {
  id: string;
  name: string;
  category: string;
  isPublished: boolean;
  assignedTo: string | null;
  nextAction: string | null;
}

export interface FolderResult {
  id: string;
  name: string;
}

export interface TemplateResult {
  id: string;
  name: string;
  category: string;
  kind: 'qr' | 'page';
  isSystem: boolean;
}

export interface SearchResults {
  query: string;
  qrCodes: QrResult[];
  pages: PageResult[];
  folders: FolderResult[];
  templates: TemplateResult[];
}

/** Trims the text and makes `%`, `_` and `\` match themselves instead of acting as wildcards. */
export function toLikePattern(query: string): string {
  const escaped = query.trim().slice(0, MAX_QUERY_LENGTH).replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

export function isSearchable(query: string): boolean {
  return query.trim().length >= MIN_QUERY_LENGTH;
}

/** One search across everything the team keeps: QR codes, pages, folders and design templates. */
export async function searchWorkspace(query: string): Promise<SearchResults> {
  const q = query.trim().slice(0, MAX_QUERY_LENGTH);

  if (!isSearchable(q)) {
    return { query: q, qrCodes: [], pages: [], folders: [], templates: [] };
  }

  const pattern = toLikePattern(q);

  const [qrRows, pageRows, folderRows, qrTemplateRows, pageTemplateRows] = await Promise.all([
    db
      .select({
        id: qrCodes.id,
        name: qrCodes.name,
        qrType: qrCodes.qrType,
        isDynamic: qrCodes.isDynamic,
        isPaused: qrCodes.isPaused,
        assignedTo: qrCodes.assignedTo,
        nextAction: qrCodes.nextAction,
      })
      .from(qrCodes)
      .where(
        and(
          isNull(qrCodes.deletedAt),
          or(
            ilike(qrCodes.name, pattern),
            ilike(qrCodes.notes, pattern),
            ilike(qrCodes.nextAction, pattern),
            ilike(qrCodes.targetUrl, pattern),
            ilike(qrCodes.payload, pattern),
            // Tags are a text[]; match if any tag contains the text.
            sql`exists (select 1 from unnest(${qrCodes.tags}) as tag where tag ilike ${pattern})`,
          ),
        ),
      )
      .orderBy(desc(qrCodes.updatedAt))
      .limit(SEARCH_LIMIT_PER_GROUP),
    db
      .select({
        id: pageTemplates.id,
        name: pageTemplates.name,
        category: pageTemplates.category,
        isPublished: pageTemplates.isPublished,
        assignedTo: pageTemplates.assignedTo,
        nextAction: pageTemplates.nextAction,
      })
      .from(pageTemplates)
      .where(
        and(
          eq(pageTemplates.isSystem, false),
          or(
            ilike(pageTemplates.name, pattern),
            ilike(pageTemplates.description, pattern),
            ilike(pageTemplates.notes, pattern),
            ilike(pageTemplates.nextAction, pattern),
          ),
        ),
      )
      .orderBy(desc(pageTemplates.updatedAt))
      .limit(SEARCH_LIMIT_PER_GROUP),
    db
      .select({ id: folders.id, name: folders.name })
      .from(folders)
      .where(ilike(folders.name, pattern))
      .orderBy(asc(folders.name))
      .limit(SEARCH_LIMIT_PER_GROUP),
    db
      .select({ id: qrTemplates.id, name: qrTemplates.name, category: qrTemplates.category, isSystem: qrTemplates.isSystem })
      .from(qrTemplates)
      .where(or(ilike(qrTemplates.name, pattern), ilike(qrTemplates.description, pattern)))
      .orderBy(asc(qrTemplates.name))
      .limit(SEARCH_LIMIT_PER_GROUP),
    db
      .select({
        id: pageTemplates.id,
        name: pageTemplates.name,
        category: pageTemplates.category,
        isSystem: pageTemplates.isSystem,
      })
      .from(pageTemplates)
      .where(and(eq(pageTemplates.isSystem, true), or(ilike(pageTemplates.name, pattern), ilike(pageTemplates.description, pattern))))
      .orderBy(asc(pageTemplates.name))
      .limit(SEARCH_LIMIT_PER_GROUP),
  ]);

  return {
    query: q,
    qrCodes: qrRows,
    pages: pageRows,
    folders: folderRows,
    templates: [
      ...qrTemplateRows.map((row): TemplateResult => ({ ...row, kind: 'qr' })),
      ...pageTemplateRows.map((row): TemplateResult => ({ ...row, kind: 'page' })),
    ],
  };
}

export function countResults(results: SearchResults): number {
  return results.qrCodes.length + results.pages.length + results.folders.length + results.templates.length;
}
