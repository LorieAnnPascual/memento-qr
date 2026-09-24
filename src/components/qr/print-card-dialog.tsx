'use client';

import { useEffect, useMemo, useState } from 'react';

import { toast } from 'sonner';
import { AlertTriangle, Loader2, Printer, XCircle } from 'lucide-react';

import { checkPrintSize } from '@/lib/qr/design-checks';
import type { QRDesignConfig } from '@/lib/qr/generator';
import {
  composeArtwork,
  downloadPrintPdf,
  heightForWidthMm,
  renderBaseCard,
  type BaseCard,
} from '@/lib/qr/print-card';
import {
  computePrintLayout,
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
import { scanTest } from '@/lib/qr/scan-test';
import type { SocialLink } from '@/lib/qr/social-badges';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface PrintCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: QRDesignConfig;
  title: string;
  socialLinks: SocialLink[];
  fileName: string;
}

const MAX_BLEED_MM = 10;

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Choose a real print size, see the card's proportions, and download a print-ready PDF with optional bleed and crop marks. */
export function PrintCardDialog({ open, onOpenChange, config, title, socialLinks, fileName }: PrintCardDialogProps) {
  // A card built at a real size opens at that size and bleed, so nothing is cropped.
  const designSize = config.cardLayout === 'custom' ? config.customCard?.sizeMm : undefined;
  const designBleed = designSize ? (config.customCard?.bleedMm ?? DEFAULT_BLEED_MM) : DEFAULT_BLEED_MM;

  const [presetId, setPresetId] = useState(designSize ? CUSTOM_PRESET_ID : PRINT_PRESETS[0].id);
  const [portrait, setPortrait] = useState(false);
  const [unit, setUnit] = useState<Unit>('mm');
  const [customWidth, setCustomWidth] = useState(designSize ? String(round(designSize.width, 2)) : '90');
  const [customHeight, setCustomHeight] = useState(designSize ? String(round(designSize.height, 2)) : '50');
  const [bleedOn, setBleedOn] = useState(designSize ? designBleed > 0 : true);
  const [bleedMm, setBleedMm] = useState(designBleed > 0 ? designBleed : DEFAULT_BLEED_MM);
  const [marksOn, setMarksOn] = useState(true);

  const [base, setBase] = useState<BaseCard | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Draw the card once when the dialog opens; resizing it later is cheap.
  useEffect(() => {
    if (!open) return;

    let ignore = false;
    Promise.resolve().then(() => {
      if (ignore) return;
      setBase(null);
      setLoadFailed(false);
    });

    renderBaseCard(config, { title, socialLinks })
      .then((card) => {
        if (!ignore) setBase(card);
      })
      .catch((error: unknown) => {
        console.error('Print card render error:', error);
        if (!ignore) setLoadFailed(true);
      });

    // The QR's version tells how many dots it has, which decides how small it can be printed.
    scanTest(config)
      .then((result) => {
        if (!ignore) setVersion(result.full.version);
      })
      .catch((error: unknown) => console.error('Print scan test error:', error));

    return () => {
      ignore = true;
    };
  }, [open, config, title, socialLinks]);

  const preset = PRINT_PRESETS.find((p) => p.id === presetId);
  const isCustom = presetId === CUSTOM_PRESET_ID;

  let widthMm: number;
  let heightMm: number;
  if (preset) {
    [widthMm, heightMm] = portrait ? [preset.heightMm, preset.widthMm] : [preset.widthMm, preset.heightMm];
  } else {
    widthMm = toMm(Number(customWidth), unit);
    heightMm = toMm(Number(customHeight), unit);
  }
  const sizeValid = isValidSizeMm(widthMm) && isValidSizeMm(heightMm);
  const effectiveBleed = bleedOn ? bleedMm : 0;

  const layout = useMemo(
    () => (sizeValid ? computePrintLayout({ widthMm, heightMm, bleedMm: effectiveBleed, cropMarks: marksOn }) : null),
    [sizeValid, widthMm, heightMm, effectiveBleed, marksOn],
  );

  const artwork = useMemo(
    () => (base && layout ? composeArtwork(base, layout, widthMm, heightMm) : null),
    [base, layout, widthMm, heightMm],
  );

  const previewUrl = useMemo(() => artwork?.canvas.toDataURL('image/jpeg', 0.85) ?? null, [artwork]);

  const sizeIssue = artwork?.qrWidthMm != null ? checkPrintSize(artwork.qrWidthMm, version).issue : null;
  const shapeWarning = artwork && artwork.cropped > 0.02;

  function matchDesignShape(): void {
    if (!base) return;
    const width = preset ? Math.round(widthMm) : widthMm;
    const height = round(heightForWidthMm(base, width));
    setPresetId(CUSTOM_PRESET_ID);
    setUnit('mm');
    setCustomWidth(String(round(width)));
    setCustomHeight(String(height));
  }

  function handlePresetChange(next: string): void {
    if (next === CUSTOM_PRESET_ID) {
      // Start the custom fields from the size that was showing.
      setCustomWidth(String(round(fromMm(widthMm, unit))));
      setCustomHeight(String(round(fromMm(heightMm, unit))));
    }
    setPresetId(next);
  }

  function handleUnitChange(next: Unit): void {
    if (isCustom && sizeValid) {
      setCustomWidth(String(round(fromMm(widthMm, next), next === 'in' ? 2 : 1)));
      setCustomHeight(String(round(fromMm(heightMm, next), next === 'in' ? 2 : 1)));
    }
    setUnit(next);
  }

  async function handleDownload(): Promise<void> {
    if (!artwork || !layout) return;

    setIsDownloading(true);
    try {
      await downloadPrintPdf(artwork, layout, fileName || 'qr-card');
      toast.success('Print PDF downloaded');
    } catch (error) {
      toast.error('Failed to create the print PDF. Please try again.');
      console.error('Print PDF error:', error);
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Print-ready card</DialogTitle>
          <DialogDescription>Pick a real size, check the proportions, and download a PDF for the printer.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[1fr_1.1fr]">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="print-size">Size</Label>
              <Select value={presetId} onValueChange={handlePresetChange}>
                <SelectTrigger id="print-size" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRINT_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_PRESET_ID}>Custom size…</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isCustom ? (
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="print-width">Width</Label>
                    <Input
                      id="print-width"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={customWidth}
                      onChange={(event) => setCustomWidth(event.target.value)}
                    />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="print-height">Height</Label>
                    <Input
                      id="print-height"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={customHeight}
                      onChange={(event) => setCustomHeight(event.target.value)}
                    />
                  </div>
                  <div className="w-24 space-y-1.5">
                    <Label htmlFor="print-unit">Unit</Label>
                    <Select value={unit} onValueChange={(v) => handleUnitChange(v as Unit)}>
                      <SelectTrigger id="print-unit" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mm">mm</SelectItem>
                        <SelectItem value="in">in</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {!sizeValid && (
                  <p className="text-sm text-destructive" role="alert">
                    Each side must be between {MIN_SIZE_MM} and {MAX_SIZE_MM} mm ({round(fromMm(MIN_SIZE_MM, 'in'), 2)} to{' '}
                    {round(fromMm(MAX_SIZE_MM, 'in'), 1)} in).
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label htmlFor="print-portrait">Portrait (turn it upright)</Label>
                <Switch id="print-portrait" checked={portrait} onCheckedChange={setPortrait} />
              </div>
            )}

            <Button type="button" variant="outline" size="sm" disabled={!base} onClick={matchDesignShape}>
              Match my design&apos;s proportions
            </Button>

            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="print-bleed">Bleed (artwork runs past the cut)</Label>
                <Switch id="print-bleed" checked={bleedOn} onCheckedChange={setBleedOn} />
              </div>
              {bleedOn && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="print-bleed-mm" className="shrink-0 font-normal">
                    Bleed (mm)
                  </Label>
                  <Input
                    id="print-bleed-mm"
                    type="number"
                    min={1}
                    max={MAX_BLEED_MM}
                    step="0.5"
                    className="w-24"
                    value={bleedMm}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value)) setBleedMm(Math.min(MAX_BLEED_MM, Math.max(1, value)));
                    }}
                  />
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label htmlFor="print-marks">Crop marks</Label>
                <Switch id="print-marks" checked={marksOn} onCheckedChange={setMarksOn} />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {loadFailed ? (
              <p className="text-sm text-destructive">The card could not be drawn. Close this and try again.</p>
            ) : !previewUrl || !layout ? (
              <div className="flex h-48 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground" role="status">
                {sizeValid ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                    Preparing preview…
                  </>
                ) : (
                  'Enter a valid size to see the preview.'
                )}
              </div>
            ) : (
              <>
                <div className="rounded-md border bg-muted/40 p-3">
                  <div
                    className="relative mx-auto w-full max-w-sm overflow-hidden bg-white shadow"
                    style={{ aspectRatio: `${layout.bleed.width} / ${layout.bleed.height}` }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt="Front of the card, at the chosen proportions" className="absolute inset-0 size-full" />
                    <div
                      aria-hidden
                      className="absolute border border-dashed border-fuchsia-500"
                      style={{
                        left: `${((layout.trim.x - layout.bleed.x) / layout.bleed.width) * 100}%`,
                        top: `${((layout.trim.y - layout.bleed.y) / layout.bleed.height) * 100}%`,
                        width: `${(widthMm / layout.bleed.width) * 100}%`,
                        height: `${(heightMm / layout.bleed.height) * 100}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    Front, {round(widthMm)} × {round(heightMm)} mm ({round(fromMm(widthMm, 'in'), 2)} × {round(fromMm(heightMm, 'in'), 2)} in).
                    {effectiveBleed > 0 && ' The dashed line is where it is cut; the outer part is bleed.'}
                  </p>
                </div>

                {artwork?.qrWidthMm != null && (
                  <p className="text-sm">
                    The QR will be about <span className="font-medium">{round(artwork.qrWidthMm)} mm</span> wide on paper.
                  </p>
                )}

                {sizeIssue && (
                  <p
                    className={`flex items-start gap-2 rounded-md border p-3 text-sm ${sizeIssue.severity === 'problem' ? 'border-destructive/50' : ''}`}
                    role="alert"
                  >
                    {sizeIssue.severity === 'problem' ? (
                      <XCircle className="mt-0.5 size-4 shrink-0 text-red-700 dark:text-red-400" aria-label="Problem" />
                    ) : (
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-label="Warning" />
                    )}
                    <span>
                      {sizeIssue.text} <span className="font-medium">Fix:</span> {sizeIssue.fix}
                    </span>
                  </p>
                )}

                {shapeWarning && (
                  <p className="flex items-start gap-2 rounded-md border p-3 text-sm" role="alert">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-label="Warning" />
                    <span>
                      This size is a different shape from your design, so about {Math.round((artwork?.cropped ?? 0) * 100)}% is cropped at the edges.
                      Use &ldquo;Match my design&apos;s proportions&rdquo; to avoid this.
                    </span>
                  </p>
                )}
              </>
            )}

            <p className="text-xs text-muted-foreground">
              The preview shows the card&apos;s layout and proportions, not its true size on your screen. For the real size, open the PDF and print
              it at 100% (&ldquo;Actual size&rdquo;, not &ldquo;Fit to page&rdquo;), then scan the printed copy before a big print run.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" disabled={!artwork || isDownloading} onClick={handleDownload}>
            <Printer className="size-4" />
            {isDownloading ? 'Creating PDF…' : 'Download print PDF'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
