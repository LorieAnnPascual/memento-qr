'use client';

import { useRef, useState } from 'react';

import type {
  CornerDotStyle,
  CornerSquareStyle,
  DotStyle,
  ErrorCorrectionLevel,
  QRStyleConfig,
} from '@/lib/qr/generator';
import { useImageUpload } from '@/hooks/use-image-upload';
import { MediaPickerButton } from '@/components/media/media-picker';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { ColorField } from './color-field';
import { GradientField } from './gradient-field';

const DOT_STYLES: { value: DotStyle; label: string }[] = [
  { value: 'square', label: 'Square' },
  { value: 'dots', label: 'Dots' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'extra-rounded', label: 'Extra rounded' },
  { value: 'classy', label: 'Classy' },
  { value: 'classy-rounded', label: 'Classy rounded' },
];

const CORNER_SQUARE_STYLES: { value: CornerSquareStyle; label: string }[] = [
  { value: 'square', label: 'Square' },
  { value: 'dot', label: 'Dot' },
  { value: 'extra-rounded', label: 'Extra rounded' },
];

const CORNER_DOT_STYLES: { value: CornerDotStyle; label: string }[] = [
  { value: 'square', label: 'Square' },
  { value: 'dot', label: 'Dot' },
];

const ERROR_CORRECTION_LEVELS: { value: ErrorCorrectionLevel; label: string }[] = [
  { value: 'L', label: 'Low (~7%)' },
  { value: 'M', label: 'Medium (~15%)' },
  { value: 'Q', label: 'Quartile (~25%)' },
  { value: 'H', label: 'High (~30%)' },
];

interface QRStyleEditorProps {
  value: QRStyleConfig;
  onChange: (value: QRStyleConfig) => void;
}

export function QRStyleEditor({ value, onChange }: QRStyleEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showRemoveLogoConfirm, setShowRemoveLogoConfirm] = useState(false);

  function patch(partial: Partial<QRStyleConfig>): void {
    onChange({ ...value, ...partial });
  }

  const { isUploading: isUploadingLogo, handleFileChange: handleLogoUpload } = useImageUpload({
    onUploaded: (file) => patch({ logoUrl: file.publicUrl }),
  });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="qr-style-dot-style">Dot style</Label>
        <Select value={value.dotStyle} onValueChange={(v) => patch({ dotStyle: v as DotStyle })}>
          <SelectTrigger id="qr-style-dot-style" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DOT_STYLES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <GradientField
        idPrefix="qr-style-dot"
        label="Dot color"
        solidColor={value.dotColor ?? '#000000'}
        gradient={value.dotGradient}
        onSolidChange={(color) => patch({ dotColor: color })}
        onGradientChange={(gradient) => patch({ dotGradient: gradient })}
      />

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="qr-style-corner-square-style">Corner square style</Label>
          <Select
            value={value.cornerSquareStyle}
            onValueChange={(v) => patch({ cornerSquareStyle: v as CornerSquareStyle })}
          >
            <SelectTrigger id="qr-style-corner-square-style" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CORNER_SQUARE_STYLES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ColorField
          id="qr-style-corner-square-color"
          label="Corner square color"
          value={value.cornerSquareColor ?? '#000000'}
          onChange={(color) => patch({ cornerSquareColor: color })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="qr-style-corner-dot-style">Corner dot style</Label>
          <Select
            value={value.cornerDotStyle}
            onValueChange={(v) => patch({ cornerDotStyle: v as CornerDotStyle })}
          >
            <SelectTrigger id="qr-style-corner-dot-style" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CORNER_DOT_STYLES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ColorField
          id="qr-style-corner-dot-color"
          label="Corner dot color"
          value={value.cornerDotColor ?? '#000000'}
          onChange={(color) => patch({ cornerDotColor: color })}
        />
      </div>

      <GradientField
        idPrefix="qr-style-background"
        label="Background color"
        solidColor={value.backgroundColor ?? '#FFFFFF'}
        gradient={value.backgroundGradient}
        onSolidChange={(color) => patch({ backgroundColor: color })}
        onGradientChange={(gradient) => patch({ backgroundGradient: gradient })}
      />

      {!value.backgroundGradient && (
        <div className="space-y-2">
          <Label htmlFor="qr-style-background-opacity">Background opacity</Label>
          <Slider
            id="qr-style-background-opacity"
            min={0}
            max={100}
            step={5}
            value={[value.backgroundOpacity ?? 100]}
            onValueChange={([next]) => patch({ backgroundOpacity: next })}
          />
        </div>
      )}

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="qr-style-error-correction">Error correction</Label>
        <Select
          value={value.errorCorrectionLevel}
          onValueChange={(v) => patch({ errorCorrectionLevel: v as ErrorCorrectionLevel })}
        >
          <SelectTrigger id="qr-style-error-correction" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ERROR_CORRECTION_LEVELS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Higher levels keep the code scannable even if it&apos;s partly damaged or has a logo, at
          the cost of a denser pattern.
        </p>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label>Logo</Label>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={handleLogoUpload}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploadingLogo}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploadingLogo ? 'Uploading…' : value.logoUrl ? 'Replace logo' : 'Upload logo'}
          </Button>
          <MediaPickerButton onSelect={(url) => patch({ logoUrl: url })} />

          {value.logoUrl && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowRemoveLogoConfirm(true)}>
              Remove
            </Button>
          )}
        </div>
        {value.logoUrl && (
          <div className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label htmlFor="qr-style-logo-size">Logo size</Label>
              <Slider
                id="qr-style-logo-size"
                min={0.1}
                max={0.5}
                step={0.05}
                value={[value.logoSize ?? 0.4]}
                onValueChange={([next]) => patch({ logoSize: next })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qr-style-logo-margin">Logo margin</Label>
              <Slider
                id="qr-style-logo-margin"
                min={0}
                max={20}
                step={1}
                value={[value.logoMargin ?? 5]}
                onValueChange={([next]) => patch({ logoMargin: next })}
              />
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showRemoveLogoConfirm}
        onOpenChange={setShowRemoveLogoConfirm}
        title="Remove this logo?"
        description="The logo will be cleared from this QR code's design. The file itself stays in your Media library."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={() => {
          patch({ logoUrl: undefined });
          setShowRemoveLogoConfirm(false);
        }}
      />
    </div>
  );
}
