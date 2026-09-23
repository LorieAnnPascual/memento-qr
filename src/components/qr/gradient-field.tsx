'use client';

import type { QRGradient } from '@/lib/qr/generator';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { ColorField } from './color-field';

interface GradientFieldProps {
  idPrefix: string;
  label: string;
  solidColor: string;
  gradient: QRGradient | undefined;
  onSolidChange: (color: string) => void;
  onGradientChange: (gradient: QRGradient | undefined) => void;
}

function defaultGradient(baseColor: string): QRGradient {
  return {
    type: 'linear',
    rotation: 45,
    colorStops: [
      { offset: 0, color: baseColor },
      { offset: 1, color: '#000000' },
    ],
  };
}

export function GradientField({
  idPrefix,
  label,
  solidColor,
  gradient,
  onSolidChange,
  onGradientChange,
}: GradientFieldProps) {
  const isGradient = gradient !== undefined;
  const startColor = gradient?.colorStops[0]?.color ?? solidColor;
  const endColor = gradient?.colorStops[1]?.color ?? '#000000';

  function setColorStop(index: 0 | 1, color: string): void {
    if (!gradient) return;
    const colorStops = [...gradient.colorStops];
    colorStops[index] = { ...colorStops[index], color };
    onGradientChange({ ...gradient, colorStops });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <div className="flex overflow-hidden rounded-md border border-input text-xs">
          <button
            type="button"
            data-testid={`${idPrefix}-solid-toggle`}
            className={cn('px-2 py-1', !isGradient ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
            onClick={() => onGradientChange(undefined)}
          >
            Solid
          </button>
          <button
            type="button"
            data-testid={`${idPrefix}-gradient-toggle`}
            className={cn('px-2 py-1', isGradient ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
            onClick={() => onGradientChange(gradient ?? defaultGradient(solidColor))}
          >
            Gradient
          </button>
        </div>
      </div>

      {!isGradient ? (
        <ColorField id={`${idPrefix}-solid`} label={label} value={solidColor} onChange={onSolidChange} />
      ) : (
        <div className="space-y-3 rounded-lg border border-input p-3">
          <div className="grid grid-cols-2 gap-3">
            <ColorField
              id={`${idPrefix}-stop-0`}
              label="Start color"
              value={startColor}
              onChange={(color) => setColorStop(0, color)}
            />
            <ColorField
              id={`${idPrefix}-stop-1`}
              label="End color"
              value={endColor}
              onChange={(color) => setColorStop(1, color)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-type`}>Gradient type</Label>
            <Select
              value={gradient.type}
              onValueChange={(v) => onGradientChange({ ...gradient, type: v as 'linear' | 'radial' })}
            >
              <SelectTrigger id={`${idPrefix}-type`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="linear">Linear</SelectItem>
                <SelectItem value="radial">Radial</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {gradient.type === 'linear' && (
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-rotation`}>Rotation</Label>
              <Slider
                id={`${idPrefix}-rotation`}
                min={0}
                max={360}
                step={5}
                value={[gradient.rotation ?? 0]}
                onValueChange={([next]) => onGradientChange({ ...gradient, rotation: next })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
