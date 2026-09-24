// Team-entered content is rendered on public pages. Every value is already
// sanitized at render time (see sanitize.ts); these policies are the second
// layer, limiting what a page may load if a value ever slips through.

const FRAME_SOURCES =
  'frame-src https://www.youtube.com https://player.vimeo.com https://maps.google.com https://www.google.com';

/**
 * Header policy for the live /p/[shortCode] page. It is a Next.js page, so it
 * needs its own scripts and styles; everything else is locked down.
 */
export const PUBLIC_PAGE_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'img-src http: https: data:',
  "font-src 'self' data: https://fonts.gstatic.com",
  FRAME_SOURCES,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

/** Policy for a standalone rendered document (previews): no scripts at all. */
export const STANDALONE_PAGE_CSP = [
  "default-src 'none'",
  'img-src http: https: data:',
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  FRAME_SOURCES,
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
