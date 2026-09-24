'use client';

import { useState } from 'react';

import type { CustomCardDesign } from '@/lib/qr/card-builder-types';
import {
  CUSTOM_PRESET_ID,
  DEFAULT_BLEED_MM,
  fromMm,
  isValidSizeMm,
  MAX_SIZE_MM,
  MIN_SIZE_MM,
  PRINT_PRESETS,
  toMm,
  type Unit,
} from '@/lib/qr/print-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export type CardSizeChange =
  | { kind: 'free'; orientation: 'vertical' | 'horizontal' }
  | { kind: 'size'; widthMm: number; heightMm: number; bleedMm: number };

interface CardSizeControlProps {
  design: CustomCardDesign;
  onChange: (change: CardSizeChange) => void;
  showGuides: boolean;
  onShowGuidesChange: (show: boolean) => void;
}

const FREE_VERTICAL = 'free-vertical';
const FREE_HORIZONTAL = 'free-horizontal';
const MAX_BLEED_MM = 10;

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Which option in the list matches the design's current size. */
function currentOption(design: CustomCardDesign): string {
  const size = design.sizeMm;
  if (!size) return design.width > design.height ? FREE_HORIZONTAL : FREE_VERTICAL;

  const match = PRINT_PRESETS.find(
    (p) =>
      (Math.abs(p.widthMm - size.width) < 0.05 && Math.abs(p.heightMm - size.height) < 0.05) ||
      (Math.abs(p.widthMm - size.height) < 0.05 && Math.abs(p.heightMm - size.width) < 0.05),
  );
  return match?.id ?? CUSTOM_PRESET_ID;
}

/** Pick the card's real printed size (or a free canvas), with bleed and on-canvas print guides. */
export function CardSizeControl({ design, onChange, showGuides, onShowGuidesChange }: CardSizeControlProps) {
  const detected = currentOption(design);
  // Choosing "Custom size…" opens the fields even before a custom size has been applied.
  const [customMode, setCustomMode] = useState(false);
  const option = customMode ? CUSTOM_PRESET_ID : detected;
  const size = design.sizeMm;
  const portrait = design.height > design.width;
  const bleedMm = design.bleedMm ?? DEFAULT_BLEED_MM;

  const [unit, setUnit] = useState<Unit>('mm');
  const [width, setWidth] = useState(() => String(round(fromMm(size?.width ?? 90, 'mm'))));
  const [height, setHeight] = useState(() => String(round(fromMm(size?.height ?? 50, 'mm'))));

  const widthMm = toMm(Number(width), unit);
  const heightMm = toMm(Number(height), unit);
  const customValid = isValidSizeMm(widthMm) && isValidSizeMm(heightMm);

  function apply(w: number, h: number, bleed: number = bleedMm): void {
    onChange({ kind: 'size', widthMm: w, heightMm: h, bleedMm: bleed });
  }

  function handleOptionChange(next: string): void {
    setCustomMode(next === CUSTOM_PRESET_ID);
    if (next === FREE_VERTICAL || next === FREE_HORIZONTAL) {
      onChange({ kind: 'free', orientation: next === FREE_VERTICAL ? 'vertical' : 'horizontal' });
      return;
    }
    if (next === CUSTOM_PRESET_ID) {
      // Start the custom fields from the size that was showing.
      if (size) {
        setWidth(String(round(fromMm(size.width, unit), unit === 'in' ? 2 : 1)));
        setHeight(String(round(fromMm(size.height, unit), unit === 'in' ? 2 : 1)));
      }
      return;
    }
    const preset = PRINT_PRESETS.find((p) => p.id === next);
    if (preset) {
      // Keep whichever way round the card already is.
      apply(portrait ? preset.heightMm : preset.widthMm, portrait ? preset.widthMm : preset.heightMm);
    }
  }

  function handleUnitChange(next: Unit): void {
    const w = toMm(Number(width), unit);
    const h = toMm(Number(height), unit);
    if (isValidSizeMm(w) && isValidSizeMm(h)) {
      setWidth(String(round(fromMm(w, next), next === 'in' ? 2 : 1)));
      setHeight(String(round(fromMm(h, next), next === 'in' ? 2 : 1)));
    }
    setUnit(next);
  }

  const showCustomFields = option === CUSTOM_PRESET_ID;

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="cb-size">Card size</Label>
        <Select value={option} onValueChange={handleOptionChange}>
          <SelectTrigger id="cb-size" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FREE_VERTICAL}>Free canvas, vertical</SelectItem>
            <SelectItem value={FREE_HORIZONTAL}>Free canvas, horizontal</SelectItem>
            {PRINT_PRESETS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_PRESET_ID}>Custom size…</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {size && !showCustomFields && (
        <div className="flex items-center gap-2 pb-2">
          <Switch
            id="cb-portrait"
            checked={portrait}
            onCheckedChange={(checked) => apply(checked ? Math.min(size.width, size.height) : Math.max(size.width, size.height), checked ? Math.max(size.width, size.height) : Math.min(size.width, size.height))}
          />
          <Label htmlFor="cb-portrait" className="font-normal">
            Portrait
          </Label>
        </div>
      )}

      {showCustomFields && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="cb-width">Width</Label>
            <Input id="cb-width" type="number" inputMode="decimal" min={0} step="any" className="w-24" value={width} onChange={(e) => setWidth(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cb-height">Height</Label>
            <Input id="cb-height" type="number" inputMode="decimal" min={0} step="any" className="w-24" value={height} onChange={(e) => setHeight(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cb-unit">Unit</Label>
            <Select value={unit} onValueChange={(v) => handleUnitChange(v as Unit)}>
              <SelectTrigger id="cb-unit" className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mm">mm</SelectItem>
                <SelectItem value="in">in</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="outline" disabled={!customValid} onClick={() => apply(widthMm, heightMm)}>
            Apply size
          </Button>
          {!customValid && (
            <p className="basis-full text-sm text-destructive" role="alert">
              Each side must be between {MIN_SIZE_MM} and {MAX_SIZE_MM} mm ({round(fromMm(MIN_SIZE_MM, 'in'), 2)} to {round(fromMm(MAX_SIZE_MM, 'in'), 1)} in).
            </p>
          )}
        </div>
      )}

      {size && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="cb-bleed">Bleed (mm)</Label>
            <Input
              id="cb-bleed"
              type="number"
              min={0}
              max={MAX_BLEED_MM}
              step="0.5"
              className="w-20"
              value={bleedMm}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) apply(size.width, size.height, Math.min(MAX_BLEED_MM, Math.max(0, value)));
              }}
            />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch id="cb-guides" checked={showGuides} onCheckedChange={onShowGuidesChange} />
            <Label htmlFor="cb-guides" className="font-normal">
              Show print guides
            </Label>
          </div>
        </>
      )}
    </div>
  );
}
