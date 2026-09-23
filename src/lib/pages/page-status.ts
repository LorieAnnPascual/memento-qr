// Pure helpers (no database import) so client components can use them.

export interface PublishedPageStatus {
  isPublished: boolean;
  shortCode: string | null;
  publishedUrl: string | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
  isExpired: boolean;
}

export function buildPublishedUrl(shortCode: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${appUrl.replace(/\/$/, '')}/p/${shortCode}`;
}

/** Derives the publish status from a page row — pure, so list views can reuse it without extra queries. */
export function toPublishStatus(page: {
  isPublished: boolean;
  shortCode: string | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
}): PublishedPageStatus {
  return {
    isPublished: page.isPublished,
    shortCode: page.shortCode,
    publishedUrl: page.shortCode ? buildPublishedUrl(page.shortCode) : null,
    publishedAt: page.publishedAt,
    expiresAt: page.expiresAt,
    isExpired: page.expiresAt ? new Date(page.expiresAt) < new Date() : false,
  };
}
