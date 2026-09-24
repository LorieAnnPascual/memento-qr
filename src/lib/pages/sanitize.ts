/**
 * Published pages render team-entered values into public HTML, so anything
 * that lands in an href/src/style must be constrained here first.
 */

const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/** Returns the URL if it uses a safe protocol, otherwise an empty string (blocks javascript:, data:, etc.). */
export function safeLinkUrl(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed;
  try {
    return SAFE_LINK_PROTOCOLS.has(new URL(trimmed).protocol) ? trimmed : '';
  } catch {
    return '';
  }
}

/** Image sources may only be http(s) or same-site relative paths. */
export function safeImageUrl(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  try {
    const { protocol } = new URL(trimmed);
    return protocol === 'http:' || protocol === 'https:' ? trimmed : '';
  } catch {
    return '';
  }
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Accepts only hex colors so a value can never break out of a style declaration. */
export function safeColor(value: string | undefined, fallback: string): string {
  const trimmed = (value ?? '').trim();
  return HEX_COLOR.test(trimmed) ? trimmed : fallback;
}

/** Converts a YouTube or Vimeo page URL into its embed URL; anything else returns ''. */
export function toVideoEmbedUrl(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';

  const host = url.hostname.replace(/^www\./, '');
  const idPattern = /^[\w-]{5,20}$/;

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id = url.pathname.startsWith('/embed/')
      ? url.pathname.split('/')[2]
      : url.searchParams.get('v');
    return id && idPattern.test(id) ? `https://www.youtube.com/embed/${id}` : '';
  }
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1);
    return idPattern.test(id) ? `https://www.youtube.com/embed/${id}` : '';
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = url.pathname.split('/').filter(Boolean).pop() ?? '';
    return /^\d{5,12}$/.test(id) ? `https://player.vimeo.com/video/${id}` : '';
  }
  return '';
}

/** Google Maps embed URL for a free-text address. */
export function toMapEmbedUrl(address: string | undefined): string {
  const trimmed = (address ?? '').trim();
  return trimmed ? `https://maps.google.com/maps?q=${encodeURIComponent(trimmed)}&output=embed` : '';
}

export const FONT_STACKS = {
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  elegant: "'Palatino Linotype', Palatino, 'Book Antiqua', serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  playfair: "'Playfair Display', Georgia, serif",
  montserrat: "'Montserrat', -apple-system, 'Segoe UI', sans-serif",
  roboto: "'Roboto', -apple-system, 'Segoe UI', sans-serif",
  inter: "'Inter', -apple-system, 'Segoe UI', sans-serif",
  lusitana: "'Lusitana', Georgia, serif",
} as const;

const GOOGLE_FONT_FAMILIES: Partial<Record<string, string>> = {
  playfair: 'Playfair+Display:wght@400;500;600;700',
  montserrat: 'Montserrat:wght@400;500;600;700',
  roboto: 'Roboto:wght@400;500;700',
  inter: 'Inter:wght@400;500;600;700',
  lusitana: 'Lusitana:wght@400;700',
};

/** Google Fonts stylesheet URL for a web font choice; '' for the built-in system fonts. */
export function resolveFontStylesheet(key: string | undefined): string {
  const family = key ? GOOGLE_FONT_FAMILIES[key] : undefined;
  return family ? `https://fonts.googleapis.com/css2?family=${family}&display=swap` : '';
}

export type FontStackKey = keyof typeof FONT_STACKS;

export function resolveFontStack(key: string | undefined): string {
  return key && key in FONT_STACKS ? FONT_STACKS[key as FontStackKey] : FONT_STACKS.sans;
}
