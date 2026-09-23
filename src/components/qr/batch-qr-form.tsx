'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import { toast } from 'sonner';
import { CheckCircle2, Download, FileSpreadsheet, TriangleAlert } from 'lucide-react';

import type { Folder, QRTemplate } from '@/lib/db/schema';
import { DEFAULT_QR_STYLE } from '@/lib/qr/generator';
import { BATCH_CSV_TEMPLATE, MAX_BATCH_ROWS, parseBatchCsv, type BatchRow } from '@/lib/qr/batch';
import { getQRTypeLabel } from '@/types/qr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const NO_FOLDER = 'none';
const DEFAULT_STYLE = 'default';
const PREVIEW_ROWS = 100;

interface BatchQRFormProps {
  folders: Pick<Folder, 'id' | 'name'>[];
  templates: Pick<QRTemplate, 'id' | 'name' | 'styleConfig'>[];
}

export function BatchQRForm({ folders, templates }: BatchQRFormProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [fileError, setFileError] = useState('');
  const [folderId, setFolderId] = useState(NO_FOLDER);
  const [styleId, setStyleId] = useState(DEFAULT_STYLE);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createdCount, setCreatedCount] = useState<number | null>(null);

  const valid = useMemo(() => rows.filter((row) => !row.error), [rows]);
  const invalid = rows.length - valid.length;

  function downloadTemplate(): void {
    const url = URL.createObjectURL(new Blob([BATCH_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'memento-qr-batch-template.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function handleFile(file: File): Promise<void> {
    setCreatedCount(null);
    setFileName(file.name);
    try {
      const result = parseBatchCsv(await file.text());
      setRows(result.rows);
      setFileError(result.fileError ?? '');
    } catch (error) {
      setRows([]);
      setFileError('That file could not be read. Please choose a .csv file.');
      console.error('Batch CSV read error:', error);
    }
  }

  function reset(): void {
    setRows([]);
    setFileName('');
    setFileError('');
    setCreatedCount(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function handleCreate(): Promise<void> {
    const template = templates.find((t) => t.id === styleId);
    const styleConfig = (template?.styleConfig as Record<string, unknown> | undefined) ?? { ...DEFAULT_QR_STYLE };

    setIsCreating(true);
    try {
      const response = await fetch('/api/qr/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: valid.map(({ name, qrType, content, isDynamic, tags }) => ({ name, qrType, content, isDynamic, tags })),
          styleConfig,
          folderId: folderId === NO_FOLDER ? null : folderId,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Failed to create the QR codes.');
      }

      const result = (await response.json()) as { created: number };
      setCreatedCount(result.created);
      setRows([]);
      setFileName('');
      if (fileInput.current) fileInput.current.value = '';
      toast.success(`${result.created} QR codes created`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create the QR codes.');
      console.error('Batch create error:', error);
    } finally {
      setIsCreating(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium">1. Upload a CSV file</p>
            <p className="text-sm text-muted-foreground">
              One row per QR code, up to {MAX_BATCH_ROWS}. Columns: name, content (or url), and optionally
              type (url, text, phone, email), dynamic (yes/no) and tags (separated by ;).
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="size-4" />
            Download template
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV file"
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        {fileError && (
          <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {fileError}
          </p>
        )}
      </div>

      {createdCount !== null && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-600/40 bg-green-600/10 p-4">
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="size-5 text-green-600" />
            {createdCount} QR codes created.
          </p>
          <div className="flex gap-2">
            <Button asChild size="sm">
              <Link href="/qr">View QR codes</Link>
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={reset}>
              Import another file
            </Button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="rounded-lg border p-4 space-y-4">
            <p className="font-medium">2. Choose where they go</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="batch-folder">Folder</Label>
                <Select value={folderId} onValueChange={setFolderId}>
                  <SelectTrigger id="batch-folder">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_FOLDER}>No folder</SelectItem>
                    {folders.map((folder) => (
                      <SelectItem key={folder.id} value={folder.id}>
                        {folder.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="batch-style">Style</Label>
                <Select value={styleId} onValueChange={setStyleId}>
                  <SelectTrigger id="batch-style">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_STYLE}>Default style</SelectItem>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <FileSpreadsheet className="size-4 text-muted-foreground" />
                <span className="font-medium">{fileName}</span>
                <Badge>{valid.length} ready</Badge>
                {invalid > 0 && <Badge variant="destructive">{invalid} with problems</Badge>}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={reset}>
                  Clear
                </Button>
                <Button type="button" disabled={valid.length === 0 || isCreating} onClick={() => setConfirmOpen(true)}>
                  Create {valid.length} QR code{valid.length === 1 ? '' : 's'}
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Row</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Check</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, PREVIEW_ROWS).map((row) => (
                    <TableRow key={row.line} className={row.error ? 'bg-destructive/5' : undefined}>
                      <TableCell className="text-muted-foreground">{row.line}</TableCell>
                      <TableCell className="font-medium">{row.name || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{getQRTypeLabel(row.qrType)}</TableCell>
                      <TableCell className="max-w-64 truncate text-muted-foreground">{row.content || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{row.isDynamic ? 'Dynamic' : 'Static'}</TableCell>
                      <TableCell>
                        {row.error ? (
                          <span className="text-sm text-destructive">{row.error}</span>
                        ) : (
                          <span className="text-sm text-green-700 dark:text-green-500">OK</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {rows.length > PREVIEW_ROWS && (
              <p className="text-sm text-muted-foreground">
                Showing the first {PREVIEW_ROWS} of {rows.length} rows. All valid rows will be created.
              </p>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Create ${valid.length} QR code${valid.length === 1 ? '' : 's'}?`}
        description={
          invalid > 0
            ? `${invalid} row${invalid === 1 ? ' has' : 's have'} problems and will be skipped.`
            : 'They will be added to your QR codes.'
        }
        confirmLabel="Create"
        pendingLabel="Creating…"
        isPending={isCreating}
        onConfirm={handleCreate}
      />
    </div>
  );
}
