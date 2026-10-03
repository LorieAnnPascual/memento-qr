import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { pageTemplates, qrCodes, slugAliases } from '@/lib/db/schema';

import { parseSlugInput, type SlugKind } from './slug';

/** Either the shared database or a transaction on it. */
type Executor = Pick<typeof db, 'select' | 'insert' | 'delete'>;

/** Postgres "unique violation": two people picked the same name at the same moment. */
export function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code === '23505' || candidate?.cause?.code === '23505';
}

/**
 * Whether `slug` is free for `kind`. A name is taken if it is anyone's current link or an
 * old link that still forwards somewhere. The item being renamed (`excludeId`) may
 * keep or go back to its own names.
 */
export async function isSlugAvailable(kind: SlugKind, slug: string, excludeId?: string, executor: Executor = db): Promise<boolean> {
  const table = kind === 'qr' ? qrCodes : pageTemplates;
  const [current] = await executor.select({ id: table.id }).from(table).where(eq(table.shortCode, slug)).limit(1);
  if (current && current.id !== excludeId) return false;

  const [alias] = await executor
    .select({ qrCodeId: slugAliases.qrCodeId, pageId: slugAliases.pageId })
    .from(slugAliases)
    .where(and(eq(slugAliases.kind, kind), eq(slugAliases.code, slug)))
    .limit(1);
  if (!alias) return true;

  return (kind === 'qr' ? alias.qrCodeId : alias.pageId) === excludeId;
}

/** The QR code or page an old link name forwards to, or null. */
export async function resolveAlias(kind: SlugKind, code: string): Promise<string | null> {
  const [alias] = await db
    .select({ qrCodeId: slugAliases.qrCodeId, pageId: slugAliases.pageId })
    .from(slugAliases)
    .where(and(eq(slugAliases.kind, kind), eq(slugAliases.code, code)))
    .limit(1);

  return (kind === 'qr' ? alias?.qrCodeId : alias?.pageId) ?? null;
}

/**
 * Call inside the same transaction that changes an item's link name: the name it had
 * keeps forwarding to it, and a name it had before and now takes back stops being an alias.
 */
export async function recordRename(executor: Executor, kind: SlugKind, id: string, oldCode: string | null, newCode: string): Promise<void> {
  const target = kind === 'qr' ? { qrCodeId: id } : { pageId: id };

  await executor
    .delete(slugAliases)
    .where(and(eq(slugAliases.kind, kind), eq(slugAliases.code, newCode)));

  if (oldCode && oldCode !== newCode) {
    await executor.insert(slugAliases).values({ kind, code: oldCode, ...target }).onConflictDoNothing();
  }
}

export type RequestedSlug = { ok: true; slug: string | null } | { ok: false; response: Response };

/**
 * Reads and checks a slug sent to an API route. Blank means "none requested". Answers
 * 400 for a name that is not allowed and 409 for one somebody else already has.
 */
export async function checkRequestedSlug(kind: SlugKind, raw: string | null | undefined, excludeId?: string): Promise<RequestedSlug> {
  const parsed = parseSlugInput(raw);
  if (!parsed.ok) {
    return { ok: false, response: Response.json({ error: parsed.error, code: 'INVALID_SLUG' }, { status: 400 }) };
  }
  if (parsed.slug && !(await isSlugAvailable(kind, parsed.slug, excludeId))) {
    return {
      ok: false,
      response: Response.json({ error: 'That link name is already taken. Try another.', code: 'SLUG_TAKEN' }, { status: 409 }),
    };
  }
  return { ok: true, slug: parsed.slug };
}

export const SLUG_TAKEN_RESPONSE = (): Response =>
  Response.json({ error: 'That link name is already taken. Try another.', code: 'SLUG_TAKEN' }, { status: 409 });
