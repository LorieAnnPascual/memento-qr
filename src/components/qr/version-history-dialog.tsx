'use client';

import { useEffect, useState } from 'react';

import { toast } from 'sonner';
import { History, Loader2, Undo2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface VersionEntry {
  id: string;
  number: number;
  isCurrent: boolean;
  summary: string;
  isRestore: boolean;
  createdAt: string;
  changedBy: string | null;
  name: string;
  qrType: string;
  destination: string;
}

interface VersionDetail {
  id: string;
  rows: { label: string; now: string; then: string }[];
  canRestore: boolean;
}

interface VersionHistoryDialogProps {
  qrId: string;
  qrName: string;
  /** Open straight away on this version (a link from the Activity page). */
  openVersionId?: string;
}

/**
 * Every saved version of a code. Pick one to see how it differs from now, then use it. Using a version
 * is itself a new version on top, so nothing is lost and it can be undone.
 */
export function VersionHistoryDialog({ qrId, qrName, openVersionId }: VersionHistoryDialogProps) {
  const [open, setOpen] = useState(Boolean(openVersionId));
  const [versions, setVersions] = useState<VersionEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(openVersionId ?? null);
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [detailFailed, setDetailFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    if (!open) return;
    let ignore = false;
    fetch(`/api/qr/${qrId}/versions`)
      .then((res) => (res.ok ? (res.json() as Promise<{ versions: VersionEntry[] }>) : Promise.reject(new Error('Request failed'))))
      .then((data) => {
        if (!ignore) setVersions(data.versions);
      })
      .catch((error: unknown) => {
        console.error('QR versions error:', error);
        if (!ignore) setFailed(true);
      });
    return () => {
      ignore = true;
    };
  }, [open, qrId]);

  // The list's "current" placeholder (a code with no saved changes yet) has no stored version to compare.
  const selected = versions?.find((version) => version.id === selectedId) ?? null;
  const selectedIsStored = selected !== null && selected.id !== 'current';

  useEffect(() => {
    if (!open || !selectedId || selectedId === 'current') return;
    let ignore = false;
    fetch(`/api/qr/${qrId}/versions/${selectedId}`)
      .then((res) => (res.ok ? (res.json() as Promise<VersionDetail>) : Promise.reject(new Error('Request failed'))))
      .then((data) => {
        if (!ignore) setDetail(data);
      })
      .catch((error: unknown) => {
        console.error('QR version detail error:', error);
        if (!ignore) setDetailFailed(true);
      });
    return () => {
      ignore = true;
    };
  }, [open, qrId, selectedId]);

  function handleOpenChange(next: boolean): void {
    // Start from a clean list each time, so an old one is never shown while the new one loads.
    if (next) {
      setVersions(null);
      setFailed(false);
    }
    setOpen(next);
  }

  function handleSelect(id: string): void {
    setDetail(null);
    setDetailFailed(false);
    setSelectedId(id);
  }

  async function handleRestore(): Promise<void> {
    if (!selected) return;

    setIsRestoring(true);
    try {
      const response = await fetch(`/api/qr/${qrId}/versions/${selected.id}/restore`, { method: 'POST' });
      if (!response.ok) throw new Error('Request failed');

      toast.success('Version restored');
      // The designer keeps what it loaded, and a `?version=` link would reopen this dialog, so go back to the plain page.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load on purpose: a client-side visit would keep the designer's old state
      window.location.href = `/qr/${qrId}`;
    } catch (error) {
      toast.error('Failed to restore that version. Please try again.');
      console.error('QR version restore error:', error);
      setIsRestoring(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" data-testid="version-history">
            <History className="size-4" />
            Version history
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
            <DialogDescription>
              Every change to {qrName || 'this QR code'}. Pick a version to see how it differs from now, then use it.
              The link and the printed picture never change.
            </DialogDescription>
          </DialogHeader>

          {!versions && !failed && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading…
            </p>
          )}

          {failed && <p className="text-sm text-destructive">The history could not be loaded. Please try again.</p>}

          {versions && versions.length > 0 && (
            <ul className="space-y-2">
              {versions.map((version) => {
                const isSelected = version.id === selectedId;
                return (
                  <li
                    key={version.id}
                    data-testid={`version-${version.number}`}
                    className={cn('rounded-md border text-sm', isSelected && 'border-primary')}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelect(version.id)}
                      aria-expanded={isSelected}
                      className="w-full p-3 text-left"
                    >
                      <p className="font-medium">
                        Version {version.number}
                        {version.isCurrent && (
                          <span className="ml-2 text-xs font-medium text-green-700 dark:text-green-400">Current</span>
                        )}
                      </p>
                      <p className="text-muted-foreground">{version.summary}</p>
                      <p className="break-all text-muted-foreground">
                        {version.qrType} · {version.destination}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {version.changedBy ?? 'Original'} · {new Date(version.createdAt).toLocaleString()}
                      </p>
                    </button>

                    {isSelected && !version.isCurrent && (
                      <div className="space-y-3 border-t p-3" data-testid="version-preview">
                        {!detail && !detailFailed && (
                          <p className="flex items-center gap-2 text-muted-foreground" role="status">
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                            Comparing with now…
                          </p>
                        )}
                        {detailFailed && (
                          <p className="text-destructive">The comparison could not be loaded. Please try again.</p>
                        )}
                        {detail && detail.rows.length > 0 && (
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="pb-1 pr-2 font-medium" />
                                <th className="pb-1 pr-2 font-medium">Now</th>
                                <th className="pb-1 font-medium">In this version</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.rows.map((row) => (
                                <tr key={row.label} className="align-top">
                                  <th className="py-1 pr-2 font-medium">{row.label}</th>
                                  <td className="break-all py-1 pr-2">{row.now}</td>
                                  <td className="break-all py-1">{row.then}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {detail && detail.rows.length === 0 && (
                          <p className="text-muted-foreground">This is the same as how the code is now.</p>
                        )}
                        {detail?.canRestore && (
                          <Button type="button" size="sm" onClick={() => setConfirming(true)}>
                            <Undo2 className="size-4" />
                            Use this version
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirming && selectedIsStored}
        onOpenChange={(next) => !next && !isRestoring && setConfirming(false)}
        title={`Use version ${selected?.number ?? ''}?`}
        description="The code goes back to how it was in that version and a new version is added, so you can undo this. Unsaved edits on this page are lost. The link and the printed picture do not change."
        confirmLabel="Use this version"
        pendingLabel="Restoring…"
        isPending={isRestoring}
        onConfirm={handleRestore}
      />
    </>
  );
}
