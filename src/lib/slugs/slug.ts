/**
 * Rules for the part of a link a person chooses (`/q/ana-memorial`, `/p/ana-memorial`).
 * Pure functions, shared by the browser (live feedback) and the server (the real check).
 */

export const SLUG_MIN_LENGTH = 3;
/** Longer links make a denser, harder-to-scan QR code, so keep them short. */
export const SLUG_MAX_LENGTH = 30;

export type SlugKind = 'qr' | 'page';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Turns whatever was typed into a clean slug: lowercase, spaces and underscores become
 * hyphens, anything else that is not a letter or number is dropped, and repeated or
 * edge hyphens are removed. "Ana's Memorial 2026!" becomes "anas-memorial-2026".
 */
export function normalizeSlug(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // é -> e
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Why a (normalized) slug cannot be used, or null when its shape is fine. Availability is checked separately. */
export function slugProblem(slug: string): string | null {
  if (slug.length < SLUG_MIN_LENGTH) return `Use at least ${SLUG_MIN_LENGTH} letters or numbers.`;
  if (slug.length > SLUG_MAX_LENGTH) return `Use at most ${SLUG_MAX_LENGTH} characters, so the QR code stays easy to scan.`;
  if (!SLUG_PATTERN.test(slug)) return 'Use only lowercase letters, numbers and single hyphens.';
  return null;
}

export function isValidSlug(slug: string): boolean {
  return slugProblem(slug) === null;
}

/** The public path prefix for each kind of link. */
export const SLUG_PATH: Record<SlugKind, string> = { qr: '/q/', page: '/p/' };

/**
 * Reads a slug a person asked for. Blank means "none given" (the app picks a random one);
 * anything else is cleaned up and must be valid.
 */
export function parseSlugInput(raw: string | null | undefined): { ok: true; slug: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw.trim() === '') return { ok: true, slug: null };
  const slug = normalizeSlug(raw);
  const problem = slugProblem(slug);
  return problem ? { ok: false, error: problem } : { ok: true, slug };
}

/**
 * Cleans text as it is being typed. Like `normalizeSlug`, but it keeps a trailing hyphen so
 * "ana-" can be followed by "memorial"; the edge hyphens are trimmed when the name is used.
 */
export function cleanSlugWhileTyping(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '');
}
