export type SocialPlatform =
  | 'facebook'
  | 'instagram'
  | 'twitter'
  | 'tiktok'
  | 'linkedin'
  | 'threads'
  | 'youtube'
  | 'other';

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  'facebook',
  'instagram',
  'twitter',
  'tiktok',
  'linkedin',
  'threads',
  'youtube',
  'other',
];

export interface SocialBadge {
  label: string;
  /** Badge background color. */
  color: string;
  /** Short glyph (1-3 chars) drawn in white, centered in the badge. */
  glyph: string;
}

// A colored badge + short glyph — not the platforms' official marks — so the
// same simple data can drive the on-screen preview, canvas export, and SVG
// export without needing brand-asset licensing or font/icon dependencies.
export const SOCIAL_BADGES: Record<SocialPlatform, SocialBadge> = {
  facebook: { label: 'Facebook', color: '#1877F2', glyph: 'f' },
  instagram: { label: 'Instagram', color: '#C13584', glyph: 'IG' },
  twitter: { label: 'Twitter / X', color: '#000000', glyph: 'X' },
  tiktok: { label: 'TikTok', color: '#000000', glyph: 'TT' },
  linkedin: { label: 'LinkedIn', color: '#0A66C2', glyph: 'in' },
  threads: { label: 'Threads', color: '#000000', glyph: '@' },
  youtube: { label: 'YouTube', color: '#FF0000', glyph: '▶' },
  other: { label: 'Other', color: '#6B7280', glyph: 'URL' },
};

export interface SocialLink {
  platform: SocialPlatform;
  url: string;
}

interface VCardSocialFields {
  facebook: string;
  instagram: string;
  twitter: string;
  tiktok: string;
  linkedin: string;
  threads: string;
}

export function getVCardSocialLinks(values: VCardSocialFields): SocialLink[] {
  const fields: [SocialPlatform, string][] = [
    ['facebook', values.facebook],
    ['instagram', values.instagram],
    ['twitter', values.twitter],
    ['tiktok', values.tiktok],
    ['linkedin', values.linkedin],
    ['threads', values.threads],
  ];
  return fields
    .filter(([, url]) => url.trim().length > 0)
    .map(([platform, url]) => ({ platform, url: url.trim() }));
}
