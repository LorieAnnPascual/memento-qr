'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

import { toast } from 'sonner';
import { ArrowLeft, Check, Copy, Download, ExternalLink, Globe, Save } from 'lucide-react';
import type { Data } from '@puckeditor/core';
import '@puckeditor/core/no-external.css';

import type { PageTemplate } from '@/lib/db/schema';
import { downloadPageHtml } from '@/lib/pages/download-html';
import { normalizePageData } from '@/lib/pages/normalize';
import { PAGE_TEMPLATE_CATEGORIES } from '@/lib/pages/templates';
import { toPublishStatus, type PublishedPageStatus } from '@/lib/pages/page-status';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { puckConfig } from './puck-config';
import { PublishStatusBadge } from './page-list';

// Puck is a large, browser-only editor: load it lazily and never on the server.
const Puck = dynamic(() => import('@puckeditor/core').then((mod) => mod.Puck), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading editor…
    </div>
  ),
});

const VIEWPORTS = [
  { width: 375, height: 'auto' as const, label: 'Mobile', icon: 'Smartphone' as const },
  { width: 768, height: 'auto' as const, label: 'Tablet', icon: 'Tablet' as const },
  { width: '100%' as const, height: 'auto' as const, label: 'Desktop', icon: 'Monitor' as const },
];

function toDateTimeLocalValue(date: Date | string | null): string {
  if (!date) return '';
  const d = new Date(date);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type PendingAction = 'save' | 'publish' | 'unpublish' | null;

interface PageEditorProps {
  page: PageTemplate;
}

export function PageEditor({ page }: PageEditorProps) {
  const [initialData] = useState<Data>(() => normalizePageData(page.puckData as Data));
  const [name, setName] = useState(page.name);
  const [category, setCategory] = useState(page.category);
  const [status, setStatus] = useState<PublishedPageStatus>(() => toPublishStatus(page));
  const [expiryInput, setExpiryInput] = useState(toDateTimeLocalValue(page.expiresAt));
  const [isDirty, setIsDirty] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [showPublishPanel, setShowPublishPanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const latestData = useRef<Data>(initialData);

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const savePage = useCallback(async (): Promise<boolean> => {
    const response = await fetch(`/api/pages/${page.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), category, puckData: latestData.current }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `Save failed (${response.status})`);
    }
    setIsDirty(false);
    return true;
  }, [page.id, name, category]);

  function requestSave(): void {
    if (!name.trim()) {
      toast.error('Give this page a name before saving.');
      return;
    }
    setPendingAction('save');
  }

  async function runAction(action: Exclude<PendingAction, null>): Promise<void> {
    setIsBusy(true);
    try {
      if (action === 'save') {
        await savePage();
        toast.success('Page saved');
      }

      if (action === 'publish') {
        // What goes live is the saved copy, so save any pending edits first.
        if (isDirty) await savePage();

        const expiresAt = expiryInput ? new Date(expiryInput).toISOString() : null;
        const response = await fetch(`/api/pages/${page.id}/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expiresAt }),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? 'Publish failed');
        }

        const result = (await response.json()) as { shortCode: string; url: string; expiresAt: string | null };
        setStatus({
          isPublished: true,
          shortCode: result.shortCode,
          publishedUrl: result.url,
          publishedAt: status.publishedAt ?? new Date(),
          expiresAt: result.expiresAt ? new Date(result.expiresAt) : null,
          isExpired: false,
        });
        toast.success('Page published');
      }

      if (action === 'unpublish') {
        const response = await fetch(`/api/pages/${page.id}/publish`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Unpublish failed');
        setStatus((prev) => ({ ...prev, isPublished: false, isExpired: false }));
        toast.success('Page unpublished');
      }

      setPendingAction(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
      console.error(`Page ${action} error:`, error);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleUpdateExpiry(): Promise<void> {
    setIsBusy(true);
    try {
      const response = await fetch(`/api/pages/${page.id}/expiry`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresAt: expiryInput ? new Date(expiryInput).toISOString() : null }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Failed to update expiration');
      }

      const result = (await response.json()) as { expiresAt: string | null };
      setStatus((prev) => ({
        ...prev,
        expiresAt: result.expiresAt ? new Date(result.expiresAt) : null,
        isExpired: false,
      }));
      toast.success(result.expiresAt ? 'Expiration updated' : 'Expiration removed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update expiration.');
      console.error('Expiry update error:', error);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleExport(): Promise<void> {
    try {
      // Exports what is on screen, including edits that aren't saved yet.
      await downloadPageHtml(name.trim() || page.name, latestData.current);
    } catch (error) {
      toast.error('Failed to export the page.');
      console.error('Page export error:', error);
    }
  }

  async function handleCopy(): Promise<void> {
    if (!status.publishedUrl) return;
    try {
      await navigator.clipboard.writeText(status.publishedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy the link.');
      console.error('Clipboard copy error:', error);
    }
  }

  const live = status.isPublished && !status.isExpired;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to pages">
          <Link href="/pages">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="w-full max-w-xs space-y-1">
          <Label htmlFor="page-name">Page name</Label>
          <Input
            id="page-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setIsDirty(true);
            }}
          />
        </div>
        <div className="w-40 space-y-1">
          <Label htmlFor="page-category">Category</Label>
          <Select
            value={category}
            onValueChange={(value) => {
              setCategory(value);
              setIsDirty(true);
            }}
          >
            <SelectTrigger id="page-category" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_TEMPLATE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="pb-1.5">
          <PublishStatusBadge
            page={{
              ...page,
              isPublished: status.isPublished,
              shortCode: status.shortCode,
              expiresAt: status.expiresAt,
              publishedAt: status.publishedAt,
            }}
          />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {isDirty && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
          <Button type="button" variant="outline" size="sm" onClick={handleExport}>
            <Download className="size-4" />
            Export HTML
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowPublishPanel(true)}>
            <Globe className="size-4" />
            {live ? 'Published' : 'Publish'}
          </Button>
          <Button type="button" size="sm" disabled={isBusy} onClick={requestSave}>
            <Save className="size-4" />
            Save
          </Button>
        </div>
      </div>

      <div className="h-[calc(100vh-14rem)] min-h-[500px] overflow-hidden rounded-lg border">
        <Puck
          config={puckConfig}
          data={initialData}
          viewports={VIEWPORTS}
          height="100%"
          onChange={(data) => {
            latestData.current = data;
            setIsDirty(true);
          }}
          // Saving and publishing live in the toolbar above; hide the editor's own header buttons.
          overrides={{ headerActions: () => <></> }}
        />
      </div>

      <Dialog open={showPublishPanel} onOpenChange={setShowPublishPanel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish page</DialogTitle>
            <DialogDescription>
              Publishing gives this page a public link that anyone can open, no login required.
            </DialogDescription>
          </DialogHeader>

          {status.isPublished && status.publishedUrl && (
            <div className="space-y-2">
              <Label>Shareable link</Label>
              <div className="flex items-center gap-2">
                <Input value={status.publishedUrl} readOnly className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" aria-label="Copy link" onClick={handleCopy}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
                <Button asChild variant="outline" size="icon">
                  <a href={status.publishedUrl} target="_blank" rel="noopener noreferrer" aria-label="Open page">
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
              </div>
              {status.isExpired && (
                <p className="text-sm text-destructive">
                  This page has expired. Set a new expiration or remove it to make the page visible again.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="page-expiry">Expires (optional)</Label>
            <Input
              id="page-expiry"
              type="datetime-local"
              value={expiryInput}
              onChange={(event) => setExpiryInput(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">Leave blank to keep the page live indefinitely.</p>
          </div>

          <DialogFooter className="sm:justify-between">
            {status.isPublished ? (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isBusy}
                  onClick={() => setPendingAction('unpublish')}
                >
                  Unpublish
                </Button>
                <Button type="button" variant="outline" disabled={isBusy} onClick={handleUpdateExpiry}>
                  Update expiration
                </Button>
              </>
            ) : (
              <Button type="button" disabled={isBusy} onClick={() => setPendingAction('publish')}>
                Publish
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingAction === 'save'}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title="Save changes to this page?"
        description="This overwrites the saved version. If the page is published, the live page updates too."
        confirmLabel="Save"
        pendingLabel="Saving…"
        isPending={isBusy}
        onConfirm={() => runAction('save')}
      />
      <ConfirmDialog
        open={pendingAction === 'publish'}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title="Publish this page?"
        description="Anyone with the link will be able to view it. Any unsaved edits are saved first."
        confirmLabel="Publish"
        pendingLabel="Publishing…"
        isPending={isBusy}
        onConfirm={() => runAction('publish')}
      />
      <ConfirmDialog
        open={pendingAction === 'unpublish'}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title="Unpublish this page?"
        description="The public link stops working immediately. Publishing again restores the same link."
        confirmLabel="Unpublish"
        pendingLabel="Unpublishing…"
        variant="destructive"
        isPending={isBusy}
        onConfirm={() => runAction('unpublish')}
      />
    </div>
  );
}
