'use client';

import { useEffect, useState } from 'react';

import { toast } from 'sonner';
import { History, Loader2, Undo2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

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

interface VersionHistoryDialogProps {
  qrId: string;
  qrName: string;
}

/** Every saved version of a code, with a way back to any of them. A restore is itself a new version. */
export function VersionHistoryDialog({ qrId, qrName }: VersionHistoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<VersionEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [target, setTarget] = useState<VersionEntry | null>(null);
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

  function handleOpenChange(next: boolean): void {
    // Start from a clean list each time, so an old one is never shown while the new one loads.
    if (next) {
      setVersions(null);
      setFailed(false);
    }
    setOpen(next);
  }

  async function handleRestore(): Promise<void> {
    if (!target) return;

    setIsRestoring(true);
    try {
      const response = await fetch(`/api/qr/${qrId}/versions/${target.id}/restore`, { method: 'POST' });
      if (!response.ok) throw new Error('Request failed');

      toast.success('Version restored');
      // The designer keeps what it loaded, so load the page again to show the restored version.
      window.location.reload();
    } catch (error) {
      toast.error('Failed to restore that version. Please try again.');
      console.error('QR version restore error:', error);
      setIsRestoring(false);
      setTarget(null);
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
              Every change to {qrName || 'this QR code'}. Restoring brings back the content, design and settings of that
              version; the link and the printed picture never change.
            </DialogDescription>
          </DialogHeader>

          {!versions && !failed && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading…
            </p>
          )}

          {failed && <p className="text-sm text-destructive">The history could not be loaded. Please try again.</p>}

          {versions && versions.length === 0 && (
            <p className="text-sm text-muted-foreground">No changes have been saved yet.</p>
          )}

          {versions && versions.length > 0 && (
            <ul className="space-y-2">
              {versions.map((version) => (
                <li key={version.id} className="rounded-md border p-3 text-sm" data-testid={`version-${version.number}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
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
                        {version.changedBy ?? 'Created'} · {new Date(version.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {!version.isCurrent && (
                      <Button type="button" variant="outline" size="sm" onClick={() => setTarget(version)}>
                        <Undo2 className="size-4" />
                        Restore
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(next) => !next && !isRestoring && setTarget(null)}
        title={`Restore version ${target?.number ?? ''}?`}
        description="The code goes back to how it was in that version and a new version is added, so you can undo this. Unsaved edits on this page are lost. The link and the printed picture do not change."
        confirmLabel="Restore"
        pendingLabel="Restoring…"
        isPending={isRestoring}
        onConfirm={handleRestore}
      />
    </>
  );
}
