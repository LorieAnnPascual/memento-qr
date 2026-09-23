'use client';

import { QrCode } from 'lucide-react';

import type { QRDesignConfig } from '@/lib/qr/generator';
import { cssFontFamily } from '@/lib/qr/card-fonts';
import type { SocialLink } from '@/lib/qr/social-badges';
import { useQRCode } from '@/hooks/use-qr-code';
import { cn } from '@/lib/utils';
import { SocialBadgeIcon } from './social-icons';

interface QRPreviewProps {
  config: QRDesignConfig;
  size?: number;
  title?: string;
  caption?: string;
  socialLinks?: SocialLink[];
}

// Card layouts sit inside a fixed-width sidebar in the designer, so the QR
// itself renders smaller than the standalone preview to leave room for the
// title/caption without clipping or requiring horizontal scroll.
const CARD_QR_SIZE: Record<'horizontal' | 'vertical', number> = {
  horizontal: 120,
  vertical: 180,
};

// The custom-card canvas renders at its full design-unit size and is scaled
// down with CSS transform to fit the sidebar — crisp at any size since the
// QR itself renders as SVG.
const CUSTOM_CARD_PREVIEW_MAX_WIDTH = 260;

export function QRPreview({ config, size = 280, title, caption, socialLinks = [] }: QRPreviewProps) {
  const layout = config.cardLayout ?? 'none';
  const isCard = layout === 'horizontal' || layout === 'vertical';
  // Only consult the custom design's own QR element size when it's actually
  // driving the layout — callers that force cardLayout: 'none' for a compact
  // preview (e.g. dashboard lists) still have `customCard` sitting in the
  // spread config, which must not leak into the requested `size`.
  const customQrElement =
    layout === 'custom' ? config.customCard?.elements.find((el) => el.type === 'qr') : undefined;
  const qrSize = isCard ? CARD_QR_SIZE[layout] : (customQrElement?.width ?? size);
  const { ref } = useQRCode(config, qrSize);

  if (!config.data) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-input bg-white p-4"
        style={{ width: size + 32, height: size + 32 }}
      >
        <div className="flex flex-col items-center gap-2 text-neutral-600">
          <QrCode className="size-10" />
          <p className="text-sm">Fill in the form to preview</p>
        </div>
      </div>
    );
  }

  if (layout === 'none') {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-input bg-white p-4"
        style={{ width: size + 32, height: size + 32 }}
      >
        <div key="none" ref={ref} data-testid="qr-preview-canvas" />
      </div>
    );
  }

  if (layout === 'custom' && config.customCard) {
    const design = config.customCard;
    const scale = Math.min(1, CUSTOM_CARD_PREVIEW_MAX_WIDTH / design.width);
    const blur = config.cardBackgroundImageBlur ?? 0;

    return (
      <div className="max-w-full overflow-x-auto">
        <div
          data-testid="qr-preview-card"
          data-layout="custom"
          className="overflow-hidden rounded-lg border border-input"
          style={{ width: design.width * scale, height: design.height * scale }}
        >
          <div
            className="relative"
            style={{
              width: design.width,
              height: design.height,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              backgroundColor: config.cardBackgroundColor ?? '#FFFFFF',
            }}
          >
            {config.cardBackgroundImage && (
              <div
                aria-hidden
                className="pointer-events-none absolute -z-10"
                style={{
                  inset: -blur,
                  backgroundImage: `url(${config.cardBackgroundImage})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: blur ? `blur(${blur}px)` : undefined,
                }}
              />
            )}
            {[...design.elements]
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((el) => {
                const boxStyle: React.CSSProperties = {
                  position: 'absolute',
                  left: el.x,
                  top: el.y,
                  width: el.width,
                  height: el.height,
                };

                if (el.type === 'qr') {
                  return (
                    <div
                      key={el.id}
                      ref={ref}
                      data-testid="qr-preview-canvas"
                      style={boxStyle}
                      className="overflow-hidden"
                    />
                  );
                }
                if (el.type === 'shape') {
                  return (
                    <div
                      key={el.id}
                      style={{
                        ...boxStyle,
                        backgroundColor: el.color,
                        opacity: el.opacity / 100,
                        borderRadius: el.shape === 'circle' ? '9999px' : undefined,
                      }}
                    />
                  );
                }
                if (el.type === 'image') {
                  return (
                    // eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded URL positioned freeform on a canvas
                    <img key={el.id} src={el.url} alt="" style={{ ...boxStyle, objectFit: 'contain' }} />
                  );
                }
                return (
                  <div
                    key={el.id}
                    style={{
                      ...boxStyle,
                      color: el.color,
                      fontFamily: cssFontFamily(el.fontFamily),
                      fontSize: el.fontSize,
                      fontWeight: el.bold ? 700 : 400,
                      textAlign: el.align,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {el.text}
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    );
  }

  const isHorizontal = layout === 'horizontal';
  const blur = config.cardBackgroundImageBlur ?? 0;

  return (
    <div className="max-w-full overflow-x-auto">
      <div
        data-testid="qr-preview-card"
        data-layout={layout}
        style={{ backgroundColor: config.cardBackgroundColor ?? '#FFFFFF' }}
        className={cn(
          'relative isolate flex gap-3 overflow-hidden rounded-lg border border-input p-4',
          isHorizontal ? 'flex-row items-center' : 'w-full max-w-[220px] flex-col items-center text-center',
        )}
      >
        {config.cardBackgroundImage && (
          <div
            aria-hidden
            className="pointer-events-none absolute -z-10"
            style={{
              inset: -blur,
              backgroundImage: `url(${config.cardBackgroundImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: blur ? `blur(${blur}px)` : undefined,
            }}
          />
        )}
        <div
          key={layout}
          ref={ref}
          data-testid="qr-preview-canvas"
          className="shrink-0 overflow-hidden rounded-md bg-white p-1"
        />
        <div className={cn('min-w-0', isHorizontal ? 'max-w-[140px] text-left' : '')}>
          {config.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-uploaded URL, not optimizable by next/image
            <img
              src={config.logoUrl}
              alt=""
              className={cn(
                'mb-1.5 size-8 rounded-full border border-input bg-white object-contain p-0.5',
                !isHorizontal && 'mx-auto',
              )}
            />
          )}
          {title && (
            <p
              className="font-semibold break-words"
              style={{
                color: config.cardTitleColor ?? '#23334e',
                fontFamily: cssFontFamily(config.cardTitleFont),
              }}
            >
              {title}
            </p>
          )}
          {caption && (
            <p
              className="text-sm break-words"
              style={{
                color: config.cardCaptionColor ?? '#6b5f52',
                fontFamily: cssFontFamily(config.cardCaptionFont),
              }}
            >
              {caption}
            </p>
          )}
          {socialLinks.length > 0 && (
            <div className={cn('mt-2 flex flex-wrap gap-1.5', !isHorizontal && 'justify-center')}>
              {socialLinks.map((link) => (
                <SocialBadgeIcon key={link.platform} platform={link.platform} size={22} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
