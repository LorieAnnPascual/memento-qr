import { and, eq, isNotNull } from 'drizzle-orm';

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
 * Where a link name stands.
 * - `free`: nobody uses it.
 * - `own`: the item being edited already has it (as its link or an old name), so it may keep it or take it back.
 * - `taken`: another live item uses it, as its link or an old name.
 * - `deleted`: it belonged to a QR code that has since been deleted. It is still reserved, but the team can
 *   choose to reuse it (after a confirmation: the old printed code will then reach the new item).
 *   Pages are deleted for good, so their names are simply freed.
 */
export type SlugState = 'free' | 'own' | 'taken' | 'deleted';

export async function getSlugState(kind: SlugKind, slug: string, excludeId?: string, executor: Executor = db): Promise<SlugState> {
  if (kind === 'qr') {
    const [current] = await executor
      .select({ id: qrCodes.id, deletedAt: qrCodes.deletedAt })
      .from(qrCodes)
      .where(eq(qrCodes.shortCode, slug))
      .limit(1);
    if (current) {
      if (current.id === excludeId) return 'own';
      return current.deletedAt ? 'deleted' : 'taken';
    }

    const [alias] = await executor
      .select({ qrCodeId: slugAliases.qrCodeId, deletedAt: qrCodes.deletedAt })
      .from(slugAliases)
      .leftJoin(qrCodes, eq(slugAliases.qrCodeId, qrCodes.id))
      .where(and(eq(slugAliases.kind, 'qr'), eq(slugAliases.code, slug)))
      .limit(1);
    if (!alias) return 'free';
    if (alias.qrCodeId === excludeId) return 'own';
    return alias.deletedAt ? 'deleted' : 'taken';
  }

  const [current] = await executor
    .select({ id: pageTemplates.id })
    .from(pageTemplates)
    .where(eq(pageTemplates.shortCode, slug))
    .limit(1);
  if (current) return current.id === excludeId ? 'own' : 'taken';

  const [alias] = await executor
    .select({ pageId: slugAliases.pageId })
    .from(slugAliases)
    .where(and(eq(slugAliases.kind, 'page'), eq(slugAliases.code, slug)))
    .limit(1);
  if (!alias) return 'free';
  return alias.pageId === excludeId ? 'own' : 'taken';
}

/** Whether `slug` can be used right now without anyone's say-so (free, or already this item's own). */
export async function isSlugAvailable(kind: SlugKind, slug: string, excludeId?: string, executor: Executor = db): Promise<boolean> {
  const state = await getSlugState(kind, slug, excludeId, executor);
  return state === 'free' || state === 'own';
}

/**
 * Lets a name that belonged to a deleted QR code be used again: the deleted code keeps its
 * record but loses the link, and any old-name or forward record of it is dropped.
 */
export async function releaseDeletedSlug(slug: string, executor: Pick<typeof db, 'update' | 'delete'> = db): Promise<void> {
  await executor.update(qrCodes).set({ shortCode: null }).where(and(eq(qrCodes.shortCode, slug), isNotNull(qrCodes.deletedAt)));
  await executor.delete(slugAliases).where(and(eq(slugAliases.kind, 'qr'), eq(slugAliases.code, slug)));
}

export interface ResolvedAlias {
  /** The QR code or page the old name belongs to. */
  id: string;
  /** True for an old link someone chose to forward here (answered with a redirect), false for the item's own old name. */
  redirect: boolean;
}

/** The QR code or page an old link name points to, or null. */
export async function resolveAlias(kind: SlugKind, code: string): Promise<ResolvedAlias | null> {
  const [alias] = await db
    .select({ qrCodeId: slugAliases.qrCodeId, pageId: slugAliases.pageId, redirect: slugAliases.redirect })
    .from(slugAliases)
    .where(and(eq(slugAliases.kind, kind), eq(slugAliases.code, code)))
    .limit(1);

  const id = kind === 'qr' ? alias?.qrCodeId : alias?.pageId;
  return alias && id ? { id, redirect: Boolean(alias.redirect) } : null;
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

export type RequestedSlug =
  | { ok: true; slug: string | null; /** The name belonged to a deleted QR code and must be released before it is used. */ reclaim: boolean }
  | { ok: false; response: Response };

export const SLUG_TAKEN_RESPONSE = (): Response =>
  Response.json({ error: 'That link name is already taken. Try another.', code: 'SLUG_TAKEN' }, { status: 409 });

export const SLUG_DELETED_RESPONSE = (): Response =>
  Response.json(
    {
      error: 'That link belonged to a QR code that was deleted. Confirm that you want to reuse it.',
      code: 'SLUG_DELETED',
    },
    { status: 409 },
  );

/**
 * Reads and checks a slug sent to an API route. Blank means "none requested". Answers
 * 400 for a name that is not allowed and 409 for one somebody else already has. A name
 * left behind by a deleted QR code is refused (409 `SLUG_DELETED`) unless the caller says
 * the person confirmed reusing it, in which case `reclaim` tells the route to release it first.
 */
export async function checkRequestedSlug(
  kind: SlugKind,
  raw: string | null | undefined,
  excludeId?: string,
  reclaimDeleted = false,
): Promise<RequestedSlug> {
  const parsed = parseSlugInput(raw);
  if (!parsed.ok) {
    return { ok: false, response: Response.json({ error: parsed.error, code: 'INVALID_SLUG' }, { status: 400 }) };
  }
  if (!parsed.slug) return { ok: true, slug: null, reclaim: false };

  const state = await getSlugState(kind, parsed.slug, excludeId);
  if (state === 'taken') return { ok: false, response: SLUG_TAKEN_RESPONSE() };
  if (state === 'deleted') {
    return reclaimDeleted ? { ok: true, slug: parsed.slug, reclaim: true } : { ok: false, response: SLUG_DELETED_RESPONSE() };
  }
  return { ok: true, slug: parsed.slug, reclaim: false };
}
