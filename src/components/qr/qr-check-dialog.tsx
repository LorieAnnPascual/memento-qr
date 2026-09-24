'use client';

import { useEffect, useState } from 'react';

import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react';

import type { DestinationCheck } from '@/lib/qr/check-destination';
import type { QrStatus } from '@/lib/qr/status';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface CheckResponse {
  status: QrStatus;
  destination: DestinationCheck;
  checkedAt: string;
}

interface QrCheckDialogProps {
  qrId: string | null;
  qrName: string;
  onOpenChange: (open: boolean) => void;
}

const HEALTH_ICON = {
  ok: <CheckCircle2 className="size-5 text-green-700 dark:text-green-400" aria-hidden />,
  warning: <AlertTriangle className="size-5 text-amber-700 dark:text-amber-400" aria-hidden />,
  problem: <XCircle className="size-5 text-red-700 dark:text-red-400" aria-hidden />,
} as const;

/** Answers "is this QR working?" for a saved code, without scanning it (so no scan is counted). */
export function QrCheckDialog({ qrId, qrName, onOpenChange }: QrCheckDialogProps) {
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!qrId) return;

    let ignore = false;
    // Deferred so this isn't a synchronous setState in the effect body.
    Promise.resolve().then(() => {
      if (ignore) return;
      setResult(null);
      setFailed(false);
    });

    fetch(`/api/qr/${qrId}/check`)
      .then((res) => {
        if (!res.ok) throw new Error('Request failed');
        return res.json() as Promise<CheckResponse>;
      })
      .then((data) => {
        if (!ignore) setResult(data);
      })
      .catch((error: unknown) => {
        console.error('QR check error:', error);
        if (!ignore) setFailed(true);
      });

    return () => {
      ignore = true;
    };
  }, [qrId]);

  const destinationOk = result?.destination.result === 'reachable';
  const destinationBad = result?.destination.result === 'unreachable';

  return (
    <Dialog open={qrId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Is this QR working?</DialogTitle>
          <DialogDescription>{qrName}</DialogDescription>
        </DialogHeader>

        {!result && !failed && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Checking…
          </p>
        )}

        {failed && <p className="text-sm text-destructive">The check could not run. Please try again.</p>}

        {result && (
          <div className="space-y-4">
            <div className="flex gap-3">
              {HEALTH_ICON[result.status.health]}
              <div>
                <p className="font-medium">{result.status.label}</p>
                <p className="text-sm text-muted-foreground">{result.status.detail}</p>
              </div>
            </div>

            {result.status.destination && (
              <div className="rounded-md border p-3 text-sm">
                <p className="text-muted-foreground">Destination</p>
                <p className="break-all font-medium">{result.status.destination}</p>
                <p className="mt-2 flex items-start gap-2">
                  {destinationOk ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-700 dark:text-green-400" aria-hidden />
                  ) : destinationBad ? (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-red-700 dark:text-red-400" aria-hidden />
                  ) : null}
                  <span>{result.destination.message}</span>
                </p>
                {result.destination.result !== 'unchecked' && (
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <a href={result.status.destination} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="size-4" />
                      Open destination
                    </a>
                  </Button>
                )}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Checked {new Date(result.checkedAt).toLocaleTimeString()}. This does not count as a scan.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
