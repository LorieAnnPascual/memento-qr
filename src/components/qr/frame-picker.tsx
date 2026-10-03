'use client';

import { useEffect, useId, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { buildFramedSvg } from '@/lib/qr/frames/build';
import {
  COMFORTABLE_CAPTION_LENGTH,
  defaultFrameConfig,
  MAX_CAPTION_LENGTH,
  resolveFrame,
  type FrameConfig,
} from '@/lib/qr/frames/config';
import { framesByOccasion, type FrameId } from '@/lib/qr/frames/registry';
import { getSampleQr, type SampleQr } from '@/lib/qr/frames/sample-qr';
import type { QRStyleConfig } from '@/lib/qr/generator';
import { cn } from '@/lib/utils';
import { ColorField } from './color-field';

interface FramePickerProps {
  value: QRStyleConfig;
  onChange: (value: QRStyleConfig) => void;
}

/** A small preview of one design, drawn by the same function the preview and the downloads use. */
function FrameThumb({ sample, frame }: { sample: SampleQr | null; frame: FrameConfig | { id: FrameId } }) {
  const src = useMemo(() => {
    if (!sample) return null;
    const framed = buildFramedSvg(sample.svg, { frame, modules: sample.modules, width: 220 });
    return framed ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(framed.svg)}` : null;
  }, [sample, frame]);

  return (
    <span className="flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-md bg-white">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a generated data URL, not optimizable by next/image
        <img src={src} alt="" className="h-full w-full object-contain" />
      ) : (
        <span className="size-8 animate-pulse rounded bg-muted" aria-hidden />
      )}
    </span>
  );
}

export function FramePicker({ value, onChange }: FramePickerProps) {
  const groupId = useId();
  const [sample, setSample] = useState<SampleQr | null>(null);

  useEffect(() => {
    let ignore = false;
    getSampleQr()
      .then((next) => {
        if (!ignore) setSample(next);
      })
      .catch((error: unknown) => console.error('Frame sample error:', error));
    return () => {
      ignore = true;
    };
  }, []);

  const current = resolveFrame(value.frame);
  const currentId = current?.definition.id ?? 'none';
  const groups = useMemo(() => framesByOccasion(), []);

  function withoutFrame(): QRStyleConfig {
    const next = { ...value };
    delete next.frame;
    return next;
  }

  function choose(id: FrameId | 'none'): void {
    if (id === 'none') {
      onChange(withoutFrame());
      return;
    }
    const next = defaultFrameConfig(id);
    // A caption someone wrote themselves is kept when they try another design.
    if (current && value.frame?.caption !== undefined && value.frame.caption !== current.definition.defaultCaption) {
      next.caption = value.frame.caption;
    }
    onChange({ ...value, frame: next });
  }

  function patchFrame(partial: Partial<FrameConfig>): void {
    if (!current) return;
    onChange({
      ...value,
      frame: { ...defaultFrameConfig(current.definition.id as FrameId), ...value.frame, ...partial } as FrameConfig,
    });
  }

  function optionClass(): string {
    return cn(
      'flex h-full cursor-pointer flex-col gap-1.5 rounded-lg border border-input p-1.5 text-center text-xs transition-colors',
      'hover:border-primary hover:bg-muted peer-checked:border-primary peer-checked:ring-2 peer-checked:ring-primary',
      'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background',
    );
  }

  return (
    <div className="space-y-3" data-testid="frame-picker">
      <div className="space-y-1">
        <p id={`${groupId}-label`} className="text-sm font-medium leading-none">
          Frame
        </p>
        <p className="text-xs text-muted-foreground">
          A decorative border for the occasion. It sits outside the code on a clear margin, so scanning is not affected.
        </p>
      </div>

      <div role="radiogroup" aria-labelledby={`${groupId}-label`} className="space-y-3">
        <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3">
          <div className="relative">
            <input
              type="radio"
              id={`${groupId}-none`}
              name={`${groupId}-frame`}
              className="peer sr-only"
              checked={currentId === 'none'}
              onChange={() => choose('none')}
            />
            <label htmlFor={`${groupId}-none`} data-testid="qr-frame-none" className={optionClass()}>
              <span className="flex aspect-[4/5] w-full items-center justify-center rounded-md border border-dashed bg-background text-muted-foreground">
                No frame
              </span>
              <span className="font-medium">None</span>
            </label>
          </div>
        </div>

        {groups.map((group) => (
          <div key={group.occasion} className="space-y-1.5" role="group" aria-label={group.label}>
            <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
            <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3">
              {group.frames.map((frame) => {
                const selected = currentId === frame.id;
                return (
                  <div key={frame.id} className="relative">
                    <input
                      type="radio"
                      id={`${groupId}-${frame.id}`}
                      name={`${groupId}-frame`}
                      className="peer sr-only"
                      checked={selected}
                      onChange={() => choose(frame.id as FrameId)}
                    />
                    <label htmlFor={`${groupId}-${frame.id}`} data-testid={`qr-frame-${frame.id}`} className={optionClass()}>
                      <FrameThumb sample={sample} frame={selected && value.frame ? value.frame : { id: frame.id as FrameId }} />
                      <span className="font-medium">{frame.label}</span>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {current && (
        <div className="space-y-4 rounded-lg border p-3" data-testid="frame-options">
          <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
            <ColorField
              id="qr-frame-color"
              label="Frame color"
              value={value.frame?.color ?? current.primary}
              onChange={(color) => patchFrame({ color })}
            />
            <ColorField
              id="qr-frame-accent"
              label="Accent color"
              value={value.frame?.accentColor ?? current.accent}
              onChange={(accentColor) => patchFrame({ accentColor })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="qr-frame-caption">Caption</Label>
            <Input
              id="qr-frame-caption"
              value={value.frame?.caption ?? current.definition.defaultCaption}
              maxLength={MAX_CAPTION_LENGTH}
              onChange={(event) => patchFrame({ caption: event.target.value })}
              aria-describedby="qr-frame-caption-hint"
            />
            <p id="qr-frame-caption-hint" className="text-xs text-muted-foreground">
              Up to {MAX_CAPTION_LENGTH} characters. Clear it for a frame without a caption.
            </p>
            {Array.from(value.frame?.caption ?? current.definition.defaultCaption).length > COMFORTABLE_CAPTION_LENGTH && (
              <p role="status" data-testid="qr-frame-caption-long" className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Long caption: the text shrinks to fit, so it gets small. Around {COMFORTABLE_CAPTION_LENGTH} characters or fewer
                stays easy to read, especially on a small print.
              </p>
            )}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={() => choose('none')}>
            Remove frame
          </Button>
        </div>
      )}
    </div>
  );
}
