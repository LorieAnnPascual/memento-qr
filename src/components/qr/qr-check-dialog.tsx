'use client';

import { useEffect, useState } from 'react';

import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, ExternalLink, History, Loader2, Undo2, XCircle } from 'lucide-react';

import type { QRCode } from '@/lib/db/schema';
import type { DestinationCheck } from '@/lib/qr/check-destination';
import { checkDesign } from '@/lib/qr/design-checks';
import type { QRDesignConfig } from '@/lib/qr/generator';
import { buildVerdict, type HealthVerdict } from '@/lib/qr/health-verdict';
import { scanTest } from '@/lib/qr/scan-test';
import type { QrStatus } from '@/lib/qr/status';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface CheckResponse {
  status: QrStatus;
  destination: DestinationCheck;
  checkedAt: string;
}

interface HistoryEntry {
  id: string;
  destination: string;
  previousDestination: string | null;
  isRestore: boolean;
  createdAt: string;
  changedBy: string | null;
}

interface HistoryResponse {
  isDynamic: boolean;
  current: string | null;
  entries: HistoryEntry[];
}

interface Report {
  verdict: HealthVerdict;
  check: CheckResponse;
  scanRan: boolean;
}

interface QrCheckDialogProps {
  /** The code to check; null keeps the dialog closed. */
  qr: QRCode | null;
  onOpenChange: (open: boolean) => void;
  /** Called after a destination was restored so the list can refresh. */
  onRestored?: () => void;
}

const LEVEL_ICON = {
  good: <CheckCircle2 className="size-5 text-green-700 dark:text-green-400" aria-hidden />,
  attention: <AlertTriangle className="size-5 text-amber-700 dark:text-amber-400" aria-hidden />,
  broken: <XCircle className="size-5 text-red-700 dark:text-red-400" aria-hidden />,
} as const;

/** "Is this QR working?" A plain verdict with a suggested fix, plus who changed the destination and when. */
export function QrCheckDialog({ qr, onOpenChange, onRestored }: QrCheckDialogProps) {
  const [report, setReport] = useState<Report | null>(null);
  const [failed, setFailed] = useState(false);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [restoreTarget, setRestoreTarget] = useState<HistoryEntry | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const qrId = qr?.id ?? null;

  useEffect(() => {
    if (!qr) return;

    let ignore = false;
    // Deferred so this isn't a synchronous setState in the effect body.
    Promise.resolve().then(() => {
      if (ignore) return;
      setReport(null);
      setFailed(false);
    });

    const config = { data: qr.payload, ...(qr.styleConfig as Omit<QRDesignConfig, 'data'>) } as QRDesignConfig;

    Promise.all([
      fetch(`/api/qr/${qr.id}/check`).then((res) => {
        if (!res.ok) throw new Error('Request failed');
        return res.json() as Promise<CheckResponse>;
      }),
      // The scan test needs a browser canvas; if it cannot run, the rest of the check still stands.
      scanTest(config).catch((error: unknown) => {
        console.error('Scan test error:', error);
        return null;
      }),
    ])
      .then(([check, scan]) => {
        if (ignore) return;
        const verdict = buildVerdict({
          status: check.status,
          destination: check.destination,
          expectedContent: qr.payload,
          scan,
          designIssues: checkDesign(config),
        });
        setReport({ verdict, check, scanRan: scan !== null });
      })
      .catch((error: unknown) => {
        console.error('QR check error:', error);
        if (!ignore) setFailed(true);
      });

    if (qr.isDynamic) {
      fetch(`/api/qr/${qr.id}/history`)
        .then((res) => (res.ok ? (res.json() as Promise<HistoryResponse>) : null))
        .then((data) => {
          if (!ignore) setHistory(data);
        })
        .catch((error: unknown) => console.error('QR history error:', error));
    }

    return () => {
      ignore = true;
      setHistory(null);
    };
    // reloadKey re-runs the whole check after a restore.
  }, [qr, reloadKey]);

  async function handleRestore(): Promise<void> {
    if (!restoreTarget || !qrId) return;

    setIsRestoring(true);
    try {
      const response = await fetch(`/api/qr/${qrId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historyId: restoreTarget.id }),
      });
      if (!response.ok) throw new Error('Request failed');

      toast.success('Earlier destination restored');
      onRestored?.();
      setReloadKey((key) => key + 1);
    } catch (error) {
      toast.error('Failed to restore that destination. Please try again.');
      console.error('QR restore error:', error);
    } finally {
      setIsRestoring(false);
      setRestoreTarget(null);
    }
  }

  const destinationOk = report?.check.destination.result === 'reachable';
  const destinationBad = report?.check.destination.result === 'unreachable';

  return (
    <>
      <Dialog open={qr !== null} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Is this QR working?</DialogTitle>
            <DialogDescription>{qr?.name}</DialogDescription>
          </DialogHeader>

          {!report && !failed && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Checking…
            </p>
          )}

          {failed && <p className="text-sm text-destructive">The check could not run. Please try again.</p>}

          {report && (
            <div className="space-y-4">
              <div className="flex gap-3">
                {LEVEL_ICON[report.verdict.level]}
                <div>
                  <p className="font-medium">{report.verdict.headline}</p>
                  {report.verdict.issues.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      {report.scanRan ? 'A test reader scanned it and read the right content.' : 'The scan test could not run in this browser.'}
                      {report.check.status.destination && destinationOk ? ' The destination answers.' : ''}
                    </p>
                  )}
                </div>
              </div>

              {report.verdict.issues.length > 0 && (
                <ul className="space-y-2">
                  {report.verdict.issues.map((issue, index) => (
                    <li key={index} className="rounded-md border p-3 text-sm">
                      <p className="flex items-start gap-2 font-medium">
                        {issue.severity === 'problem' ? (
                          <XCircle className="mt-0.5 size-4 shrink-0 text-red-700 dark:text-red-400" aria-label="Problem" />
                        ) : (
                          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-label="Warning" />
                        )}
                        <span>{issue.text}</span>
                      </p>
                      <p className="mt-1 pl-6 text-muted-foreground">
                        <span className="font-medium text-foreground">Fix: </span>
                        {issue.fix}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {report.check.status.destination && (
                <div className="rounded-md border p-3 text-sm">
                  <p className="text-muted-foreground">Destination</p>
                  <p className="break-all font-medium">{report.check.status.destination}</p>
                  <p className="mt-2 flex items-start gap-2">
                    {destinationOk ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-700 dark:text-green-400" aria-hidden />
                    ) : destinationBad ? (
                      <XCircle className="mt-0.5 size-4 shrink-0 text-red-700 dark:text-red-400" aria-hidden />
                    ) : null}
                    <span>{report.check.destination.message}</span>
                  </p>
                  {report.check.destination.result !== 'unchecked' && (
                    <Button asChild variant="outline" size="sm" className="mt-3">
                      <a href={report.check.status.destination} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="size-4" />
                        Open destination
                      </a>
                    </Button>
                  )}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Checked {new Date(report.check.checkedAt).toLocaleTimeString()}. This does not count as a scan. A screen test cannot judge
                a printed code; print a copy at 100% and scan it before a big print run.
              </p>
            </div>
          )}

          {qr?.isDynamic && history && (
            <div className="space-y-2 border-t pt-4">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <History className="size-4" aria-hidden />
                Destination history
              </h3>
              {history.entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No changes recorded yet. Changes to the destination will be listed here.
                </p>
              ) : (
                <ul className="space-y-2">
                  {history.entries.map((entry) => {
                    const isCurrent = entry.destination === history.current;
                    return (
                      <li key={entry.id} className="rounded-md border p-2 text-sm">
                        <p className="break-all font-medium">{entry.destination}</p>
                        <p className="text-muted-foreground">
                          {entry.isRestore ? 'Restored' : entry.previousDestination ? 'Changed' : 'Set'} by {entry.changedBy ?? 'a teammate'} on{' '}
                          {new Date(entry.createdAt).toLocaleString()}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          {isCurrent ? (
                            <span className="text-xs font-medium text-green-700 dark:text-green-400">Current</span>
                          ) : (
                            <Button type="button" variant="outline" size="sm" onClick={() => setRestoreTarget(entry)}>
                              <Undo2 className="size-4" />
                              Restore this destination
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
        title="Restore this destination?"
        description={`${qr?.name ?? 'This code'} will send people to ${restoreTarget?.destination ?? ''} again. The printed code does not change.`}
        confirmLabel="Restore"
        pendingLabel="Restoring…"
        isPending={isRestoring}
        onConfirm={handleRestore}
      />
    </>
  );
}
