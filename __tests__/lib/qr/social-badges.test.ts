import { describe, it, expect } from 'vitest';

import { getVCardSocialLinks, SOCIAL_BADGES, SOCIAL_PLATFORMS } from '@/lib/qr/social-badges';

describe('getVCardSocialLinks', () => {
  it('returns only the platforms with a non-empty url', () => {
    const links = getVCardSocialLinks({
      facebook: 'https://facebook.com/juan',
      instagram: '',
      twitter: 'https://x.com/juan',
      tiktok: '',
      linkedin: '',
      threads: '',
    });

    expect(links).toEqual([
      { platform: 'facebook', url: 'https://facebook.com/juan' },
      { platform: 'twitter', url: 'https://x.com/juan' },
    ]);
  });

  it('returns an empty array when no social fields are set', () => {
    expect(
      getVCardSocialLinks({
        facebook: '',
        instagram: '',
        twitter: '',
        tiktok: '',
        linkedin: '',
        threads: '',
      }),
    ).toEqual([]);
  });

  it('trims whitespace-only values as empty', () => {
    expect(
      getVCardSocialLinks({
        facebook: '   ',
        instagram: '',
        twitter: '',
        tiktok: '',
        linkedin: '',
        threads: '',
      }),
    ).toEqual([]);
  });

  it('trims surrounding whitespace from returned urls', () => {
    expect(
      getVCardSocialLinks({
        facebook: '  https://facebook.com/juan  ',
        instagram: '',
        twitter: '',
        tiktok: '',
        linkedin: '',
        threads: '',
      }),
    ).toEqual([{ platform: 'facebook', url: 'https://facebook.com/juan' }]);
  });
});

describe('SOCIAL_BADGES', () => {
  it('has a badge definition for every declared platform', () => {
    for (const platform of SOCIAL_PLATFORMS) {
      expect(SOCIAL_BADGES[platform]).toBeDefined();
      expect(SOCIAL_BADGES[platform].label).toBeTruthy();
      expect(SOCIAL_BADGES[platform].glyph).toBeTruthy();
    }
  });
});
