'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { QrCode, RectangleHorizontal, RectangleVertical } from 'lucide-react';

import type { QRCardLayout, QRStyleConfig } from '@/lib/qr/generator';
import { CARD_FONTS, type CardFontKey } from '@/lib/qr/card-fonts';
import { useImageUpload } from '@/hooks/use-image-upload';
import { MediaPickerButton } from '@/components/media/media-picker';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { ColorField } from './color-field';

const FONT_OPTIONS = Object.entries(CARD_FONTS) as [CardFontKey, (typeof CARD_FONTS)[CardFontKey]][];

const LAYOUT_OPTIONS: { value: QRCardLayout; label: string; icon: typeof QrCode }[] = [
  { value: 'none', label: 'QR code only', icon: QrCode },
  { value: 'horizontal', label: 'Horizontal card', icon: RectangleHorizontal },
  { value: 'vertical', label: 'Vertical card', icon: RectangleVertical },
];

interface QRLayoutPickerProps {
  value: QRStyleConfig;
  onChange: (value: QRStyleConfig) => void;
}

export function QRLayoutPicker({ value, onChange }: QRLayoutPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showRemoveImageConfirm, setShowRemoveImageConfirm] = useState(false);
  const layout = value.cardLayout ?? 'none';

  function patch(partial: Partial<QRStyleConfig>): void {
    onChange({ ...value, ...partial });
  }

  const { isUploading, handleFileChange } = useImageUpload({
    onUploaded: (file) => patch({ cardBackgroundImage: file.publicUrl }),
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {LAYOUT_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = option.value === layout;

          return (
            <button
              key={option.value}
              type="button"
              data-testid={`qr-layout-${option.value}`}
              aria-pressed={isActive}
              onClick={() => patch({ cardLayout: option.value })}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-xs font-medium transition-colors',
                isActive
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="size-5" />
              {option.label}
            </button>
          );
        })}
      </div>
      {layout === 'custom' && (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          This QR uses a custom card design from the Card Builder. Choose a layout above to replace
          it, or open the template in{' '}
          <Link href="/templates" className="underline">
            Templates
          </Link>{' '}
          to edit the design itself.
        </p>
      )}
      {(layout === 'horizontal' || layout === 'vertical') && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="qr-layout-caption">Caption (optional)</Label>
            <Input
              id="qr-layout-caption"
              placeholder="e.g. Scan to view menu"
              value={value.cardCaption ?? ''}
              onChange={(event) => patch({ cardCaption: event.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ColorField
              id="qr-layout-title-color"
              label="Title color"
              value={value.cardTitleColor ?? '#23334E'}
              onChange={(color) => patch({ cardTitleColor: color })}
            />
            <div className="space-y-2">
              <Label htmlFor="qr-layout-title-font">Title font</Label>
              <Select
                value={value.cardTitleFont ?? 'playfair'}
                onValueChange={(v) => patch({ cardTitleFont: v as CardFontKey })}
              >
                <SelectTrigger id="qr-layout-title-font" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map(([key, font]) => (
                    <SelectItem key={key} value={key}>
                      {font.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ColorField
              id="qr-layout-caption-color"
              label="Caption color"
              value={value.cardCaptionColor ?? '#6B5F52'}
              onChange={(color) => patch({ cardCaptionColor: color })}
            />
            <div className="space-y-2">
              <Label htmlFor="qr-layout-caption-font">Caption font</Label>
              <Select
                value={value.cardCaptionFont ?? 'garamond'}
                onValueChange={(v) => patch({ cardCaptionFont: v as CardFontKey })}
              >
                <SelectTrigger id="qr-layout-caption-font" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map(([key, font]) => (
                    <SelectItem key={key} value={key}>
                      {font.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <ColorField
            id="qr-layout-card-background-color"
            label="Card background color"
            value={value.cardBackgroundColor ?? '#FFFFFF'}
            onChange={(color) => patch({ cardBackgroundColor: color })}
          />

          <div className="space-y-2">
            <Label>Card background image (optional)</Label>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? 'Uploading…' : value.cardBackgroundImage ? 'Replace image' : 'Upload image'}
              </Button>
              <MediaPickerButton onSelect={(url) => patch({ cardBackgroundImage: url })} />
              {value.cardBackgroundImage && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRemoveImageConfirm(true)}
                >
                  Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Covers the whole card. The card background color still shows where the image doesn&apos;t
              fully cover.
            </p>
          </div>

          {value.cardBackgroundImage && (
            <div className="space-y-2">
              <Label htmlFor="qr-layout-background-blur">Background image blur</Label>
              <Slider
                id="qr-layout-background-blur"
                min={0}
                max={20}
                step={1}
                value={[value.cardBackgroundImageBlur ?? 0]}
                onValueChange={([next]) => patch({ cardBackgroundImageBlur: next })}
              />
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={showRemoveImageConfirm}
        onOpenChange={setShowRemoveImageConfirm}
        title="Remove this background image?"
        description="The card will fall back to its background color. The file itself stays in your Media library."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={() => {
          patch({ cardBackgroundImage: undefined });
          setShowRemoveImageConfirm(false);
        }}
      />
    </div>
  );
}
