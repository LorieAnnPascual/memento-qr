import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { slugAliases } from '@/lib/db/schema';

import { parseSlugInput, type SlugKind } from './slug';
import { getSlugState, isUniqueViolation, releaseDeletedSlug, SLUG_DELETED_RESPONSE } from './slugs';

export interface ForwardLink {
  code: string;
  createdAt: Date;
}

function targetColumn(kind: SlugKind) {
  return kind === 'qr' ? slugAliases.qrCodeId : slugAliases.pageId;
}

/** The old links forwarded to one QR code or page, oldest first. */
export async function listForwards(kind: SlugKind, id: string): Promise<ForwardLink[]> {
  return db
    .select({ code: slugAliases.code, createdAt: slugAliases.createdAt })
    .from(slugAliases)
    .where(and(eq(slugAliases.kind, kind), eq(slugAliases.redirect, true), eq(targetColumn(kind), id)))
    .orderBy(asc(slugAliases.createdAt));
}

export type AddForwardResult = { ok: true; code: string } | { ok: false; response: Response };

const refuse = (error: string, code: string, status: number): AddForwardResult => ({
  ok: false,
  response: Response.json({ error, code }, { status }),
});

/**
 * Sends an old link name to a QR code or page with a permanent redirect. The name must not be in
 * use: the item's own current link and old names count as in use (forwarding a link to itself
 * is pointless). A name left behind by a deleted QR code can be taken over once the person
 * confirmed it (`reclaimDeleted`), because its old printed code will then reach this item.
 */
export async function addForward(kind: SlugKind, id: string, raw: string, reclaimDeleted: boolean): Promise<AddForwardResult> {
  const parsed = parseSlugInput(raw);
  if (!parsed.ok) return refuse(parsed.error, 'INVALID_SLUG', 400);
  if (!parsed.slug) return refuse('Enter the old link name to forward.', 'INVALID_SLUG', 400);
  const code = parsed.slug;

  const state = await getSlugState(kind, code);
  if (state === 'taken' || state === 'own') {
    return refuse('That link name is already in use, so it cannot be forwarded.', 'SLUG_TAKEN', 409);
  }
  if (state === 'deleted') {
    if (!reclaimDeleted) return { ok: false, response: SLUG_DELETED_RESPONSE() };
    await releaseDeletedSlug(code);
  }

  try {
    await db.insert(slugAliases).values({
      kind,
      code,
      redirect: true,
      ...(kind === 'qr' ? { qrCodeId: id } : { pageId: id }),
    });
  } catch (error) {
    if (isUniqueViolation(error)) return refuse('That link name is already in use, so it cannot be forwarded.', 'SLUG_TAKEN', 409);
    throw error;
  }
  return { ok: true, code };
}

/** Stops forwarding an old link (it becomes free). False when it was not forwarded to this item. */
export async function removeForward(kind: SlugKind, id: string, code: string): Promise<boolean> {
  const removed = await db
    .delete(slugAliases)
    .where(
      and(eq(slugAliases.kind, kind), eq(slugAliases.code, code), eq(slugAliases.redirect, true), eq(targetColumn(kind), id)),
    )
    .returning({ code: slugAliases.code });
  return removed.length > 0;
}
