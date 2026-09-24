'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { toast } from 'sonner';
import type { Data } from '@puckeditor/core';
import { Copy, CopyPlus, Download, ExternalLink, FilePlus, Pencil, Trash2, UserRoundCheck } from 'lucide-react';

import type { PageTemplate } from '@/lib/db/schema';
import { downloadPageHtml } from '@/lib/pages/download-html';
import { toPublishStatus } from '@/lib/pages/page-status';
import type { TeamMember } from '@/lib/team/members';
import { checklistProgress, normalizeChecklist } from '@/lib/workflow/checklist';
import { WorkflowDialog, type WorkflowFields } from '@/components/workflow/workflow-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function PublishStatusBadge({ page }: { page: PageTemplate }) {
  const status = toPublishStatus(page);

  if (status.isPublished && status.isExpired) return <Badge variant="destructive">Expired</Badge>;
  if (status.isPublished) return <Badge>Published</Badge>;
  if (status.shortCode) return <Badge variant="outline">Unpublished</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

interface PageListProps {
  initialItems: PageTemplate[];
  members: TeamMember[];
}

export function PageList({ initialItems, members }: PageListProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [pendingDelete, setPendingDelete] = useState<PageTemplate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [workflowTarget, setWorkflowTarget] = useState<PageTemplate | null>(null);

  const memberName = (id: string | null): string | null => (id ? (members.find((m) => m.id === id)?.name ?? null) : null);

  async function handleCopy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch (error) {
      toast.error('Failed to copy the link.');
      console.error('Clipboard copy error:', error);
    }
  }

  async function handleExport(page: PageTemplate): Promise<void> {
    try {
      await downloadPageHtml(page.name, page.puckData as Data);
    } catch (error) {
      toast.error('Failed to export the page.');
      console.error('Page export error:', error);
    }
  }

  async function handleDuplicate(page: PageTemplate): Promise<void> {
    setDuplicatingId(page.id);
    try {
      const response = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${page.name} (copy)`.slice(0, 200),
          description: page.description ?? undefined,
          category: page.category,
          fromTemplateId: page.id,
        }),
      });
      if (!response.ok) throw new Error('Request failed');

      const created = (await response.json()) as PageTemplate;
      setItems((prev) => [created, ...prev]);
      toast.success(`Duplicated "${page.name}" as an unpublished copy`);
      router.refresh();
    } catch (error) {
      toast.error('Failed to duplicate the page. Please try again.');
      console.error('Page duplicate error:', error);
    } finally {
      setDuplicatingId(null);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!pendingDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/pages/${pendingDelete.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Request failed');

      setItems((prev) => prev.filter((item) => item.id !== pendingDelete.id));
      toast.success('Page deleted');
      router.refresh();
    } catch (error) {
      toast.error('Failed to delete page. Please try again.');
      console.error('Page delete error:', error);
    } finally {
      setIsDeleting(false);
      setPendingDelete(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button asChild>
          <Link href="/pages/new">
            <FilePlus className="size-4" />
            New page
          </Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <p>No pages yet.</p>
          <Button asChild className="mt-3" size="sm">
            <Link href="/pages/new">Create your first page</Link>
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-48 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const status = toPublishStatus(item);
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      <Link href={`/pages/${item.id}`} className="hover:underline">
                        {item.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground capitalize">{item.category}</TableCell>
                    <TableCell>
                      <PublishStatusBadge page={item} />
                    </TableCell>
                    <TableCell className="max-w-56 text-sm">
                      {memberName(item.assignedTo) ? (
                        <Badge variant="outline" className="font-normal">
                          Assigned to {memberName(item.assignedTo)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                      {item.nextAction && (
                        <p className="mt-1 truncate text-muted-foreground" title={item.nextAction}>
                          Next: {item.nextAction}
                        </p>
                      )}
                      {(() => {
                        const progress = checklistProgress(normalizeChecklist(item.checklist));
                        return progress.total > 0 ? (
                          <p className="text-muted-foreground">
                            Checklist {progress.done}/{progress.total}
                          </p>
                        ) : null;
                      })()}
                      <p className="text-xs text-muted-foreground">
                        By {memberName(item.userId) ?? 'a teammate'}
                        {item.updatedBy && item.updatedBy !== item.userId
                          ? `, edited by ${memberName(item.updatedBy) ?? 'a teammate'}`
                          : ''}
                      </p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(item.updatedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {status.isPublished && !status.isExpired && status.publishedUrl && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Copy link for ${item.name}`}
                              onClick={() => handleCopy(status.publishedUrl!)}
                            >
                              <Copy className="size-4" />
                            </Button>
                            <Button asChild variant="ghost" size="icon-sm">
                              <a
                                href={status.publishedUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Open ${item.name}`}
                              >
                                <ExternalLink className="size-4" />
                              </a>
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Export ${item.name} as HTML`}
                          onClick={() => handleExport(item)}
                        >
                          <Download className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Duplicate ${item.name}`}
                          title="Duplicate"
                          disabled={duplicatingId === item.id}
                          onClick={() => handleDuplicate(item)}
                        >
                          <CopyPlus className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Handoff and checklist for ${item.name}`}
                          title="Handoff & checklist"
                          onClick={() => setWorkflowTarget(item)}
                        >
                          <UserRoundCheck className="size-4" />
                        </Button>
                        <Button asChild variant="ghost" size="icon-sm">
                          <Link href={`/pages/${item.id}`} aria-label={`Edit ${item.name}`}>
                            <Pencil className="size-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${item.name}`}
                          onClick={() => setPendingDelete(item)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {workflowTarget && (
        <WorkflowDialog
          key={workflowTarget.id}
          kind="page"
          itemId={workflowTarget.id}
          itemName={workflowTarget.name}
          value={workflowTarget}
          members={members}
          open
          onOpenChange={(open) => !open && setWorkflowTarget(null)}
          onSaved={(next: WorkflowFields) =>
            setItems((prev) => prev.map((item) => (item.id === workflowTarget.id ? { ...item, ...next } : item)))
          }
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this page?"
        description={
          pendingDelete && toPublishStatus(pendingDelete).isPublished
            ? `"${pendingDelete.name}" is live. Deleting it takes its public link offline permanently.`
            : `"${pendingDelete?.name ?? ''}" will be permanently deleted.`
        }
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        variant="destructive"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
