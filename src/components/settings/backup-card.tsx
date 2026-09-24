'use client';

import { useRef, useState } from 'react';

import { toast } from 'sonner';
import { Download, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface BackupCardProps {
  isAdmin: boolean;
}

export function BackupCard({ isAdmin }: BackupCardProps) {
  const [includeTeam, setIncludeTeam] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ text: string; counts: Record<string, number> } | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleExport(): Promise<void> {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/export${includeTeam ? '?scope=team' : ''}`);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Failed to export your data.');
      }

      const blob = await response.blob();
      const fileName =
        /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'memento-qr-backup.json';

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      toast.success('Backup downloaded');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to export your data.');
      console.error('Backup export error:', error);
    } finally {
      setIsExporting(false);
    }
  }

  function handleFileChosen(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    file
      .text()
      .then((text) => {
        const parsed = JSON.parse(text) as { app?: string; counts?: Record<string, number> };
        if (parsed.app !== 'memento-qr') throw new Error('not a backup');
        setPending({ text, counts: parsed.counts ?? {} });
      })
      .catch((error: unknown) => {
        toast.error('That file is not a Memento QR backup.');
        console.error('Backup file read error:', error);
      });
  }

  async function handleRestore(): Promise<void> {
    if (!pending) return;
    setIsRestoring(true);
    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: pending.text,
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; added?: Record<string, number>; skipped?: Record<string, number>; invalid?: number }
        | null;
      if (!response.ok || !body?.added || !body.skipped) throw new Error(body?.error ?? 'Failed to restore the backup.');

      const added = Object.values(body.added).reduce((sum, n) => sum + n, 0);
      const skipped = Object.values(body.skipped).reduce((sum, n) => sum + n, 0);
      setResult(
        `Restored ${added} item${added === 1 ? '' : 's'} ` +
          `(${body.added.qrCodes} QR codes, ${body.added.qrTemplates} templates, ${body.added.pages} pages, ` +
          `${body.added.folders} folders). Skipped ${skipped} that already existed` +
          `${body.invalid ? ` and ${body.invalid} that could not be read` : ''}.`,
      );
      toast.success('Backup restored');
      setPending(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to restore the backup.');
      console.error('Backup restore error:', error);
    } finally {
      setIsRestoring(false);
    }
  }

  const pendingCounts = pending?.counts ?? {};

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Downloads one JSON file with your QR codes, folders, templates, landing pages, scan history and activity. Keep it
        somewhere safe; it contains everything needed to rebuild your work.
      </p>
      {isAdmin && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeTeam} onChange={(event) => setIncludeTeam(event.target.checked)} />
          Include the whole team&apos;s data
        </label>
      )}
      <Button type="button" onClick={handleExport} disabled={isExporting}>
        <Download className="size-4" />
        {isExporting ? 'Preparing…' : 'Download backup'}
      </Button>

      <div className="space-y-2 border-t pt-4">
        <h3 className="text-sm font-medium">Restore from a backup</h3>
        <p className="text-sm text-muted-foreground">
          Choose a backup file you downloaded earlier. Restoring only adds what is missing: nothing you have now is
          changed or overwritten, and everything restored goes into your own account. Scan history is not restored,
          so restored codes start counting scans from zero.
        </p>
        <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={handleFileChosen} />
        <Button type="button" variant="outline" onClick={() => fileInput.current?.click()} disabled={isRestoring}>
          <Upload className="size-4" />
          Choose backup file…
        </Button>
        {result && (
          <p role="status" className="text-sm text-muted-foreground">
            {result}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title="Restore this backup?"
        description={`This file has ${pendingCounts.qrCodes ?? 0} QR codes, ${pendingCounts.qrTemplates ?? 0} templates, ${pendingCounts.pages ?? 0} pages and ${pendingCounts.folders ?? 0} folders. Only items you do not already have will be added.`}
        confirmLabel="Restore"
        pendingLabel="Restoring…"
        isPending={isRestoring}
        onConfirm={() => void handleRestore()}
      />
    </div>
  );
}
