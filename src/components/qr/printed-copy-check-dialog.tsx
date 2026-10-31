'use client';

import { useRef, useState } from 'react';

import { AlertTriangle, CheckCircle2, Loader2, ScanLine, XCircle } from 'lucide-react';

import { comparePrinted, type PrintedCheck } from '@/lib/qr/compare-printed';
import { readQrFromFile, validatePrintedCopy } from '@/lib/qr/read-image';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface PrintedCopyCheckDialogProps {
  /** What this code's picture encodes right now (its short link for a dynamic code). */
  expectedPayload: string;
  isDynamic: boolean;
}

interface Result {
  fileName: string;
  decoded: string | null;
  check: PrintedCheck;
}

/**
 * Upload the soft copy of a printed code (PNG or JPG). It is read in the browser, nothing is stored, and the
 * result says whether the print is this code and whether its type can change without the picture changing.
 */
export function PrintedCopyCheckDialog({ expectedPayload, isDynamic }: PrintedCopyCheckDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isReading, setIsReading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function handleFile(file: File | undefined): Promise<void> {
    if (!file) return;

    setResult(null);
    const invalid = validatePrintedCopy(file);
    setProblem(invalid);
    if (invalid) return;

    setIsReading(true);
    try {
      const decoded = await readQrFromFile(file);
      setResult({ fileName: file.name, decoded, check: comparePrinted({ decoded, expectedPayload, isDynamic }) });
    } catch (error) {
      console.error('Printed copy read error:', error);
      setProblem('That picture could not be opened. Try another file.');
    } finally {
      setIsReading(false);
      // So choosing the same file again still runs.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const icon = result
    ? result.check.safeToChangeType
      ? <CheckCircle2 className="size-5 shrink-0 text-green-600" aria-hidden />
      : result.check.kind === 'unreadable' || result.check.kind === 'not-a-memento-link'
        ? <XCircle className="size-5 shrink-0 text-destructive" aria-hidden />
        : <AlertTriangle className="size-5 shrink-0 text-amber-600" aria-hidden />
    : null;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          setResult(null);
          setProblem(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" data-testid="check-printed-copy">
          <ScanLine className="size-4" />
          Check a printed copy
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Check a printed copy</DialogTitle>
          <DialogDescription>
            Choose the soft copy (PNG or JPG) of the QR code that was printed. It is read right here in your browser and
            is not uploaded or saved. You will see whether it is this code and whether it is safe to change the type.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            data-testid="printed-copy-input"
            onChange={(event) => void handleFile(event.target.files?.[0])}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
          />

          {isReading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Reading the code…
            </p>
          )}

          {problem && <p className="text-sm text-destructive">{problem}</p>}

          {result && (
            <div className="flex gap-3 rounded-md border p-3 text-sm" data-testid="printed-copy-result">
              {icon}
              <div className="space-y-1">
                <p className="font-medium">{result.check.headline}</p>
                <p className="text-muted-foreground">{result.check.detail}</p>
                <p className="break-all text-xs text-muted-foreground">
                  {result.fileName}
                  {result.decoded ? ` holds: ${result.decoded}` : ''}
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
