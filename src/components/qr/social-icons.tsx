import { SOCIAL_BADGES, type SocialPlatform } from '@/lib/qr/social-badges';

interface SocialBadgeIconProps {
  platform: SocialPlatform;
  size?: number;
}

export function SocialBadgeIcon({ platform, size = 24 }: SocialBadgeIconProps) {
  const badge = SOCIAL_BADGES[platform];
  return (
    <div
      title={badge.label}
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: badge.color,
        fontSize: Math.max(8, size * 0.4),
        lineHeight: 1,
      }}
    >
      {badge.glyph}
    </div>
  );
}
