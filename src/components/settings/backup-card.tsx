'use client';

import { useState } from 'react';

import { toast } from 'sonner';
import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface BackupCardProps {
  isAdmin: boolean;
}

export function BackupCard({ isAdmin }: BackupCardProps) {
  const [includeTeam, setIncludeTeam] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

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
    </div>
  );
}
