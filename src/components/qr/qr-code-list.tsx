'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { toast } from 'sonner';
import { Copy, FileSpreadsheet, FolderCog, GitCompareArrows, HeartPulse, Pencil, Plus, Search, Trash2, UserRoundCheck } from 'lucide-react';

import type { QRCode } from '@/lib/db/schema';
import type { QRStyleConfig } from '@/lib/qr/generator';
import { getQRTypeLabel, QR_TYPES, type QRType } from '@/types/qr';
import type { TeamMember } from '@/lib/team/members';
import { checklistProgress, normalizeChecklist } from '@/lib/workflow/checklist';
import { WorkflowDialog, type WorkflowFields } from '@/components/workflow/workflow-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useDebounce } from '@/hooks/use-debounce';
import { FolderManager, type FolderItem } from './folder-manager';
import { QrCheckDialog } from './qr-check-dialog';
import { QRPreview } from './qr-preview';

interface QRCodeListProps {
  initialItems: QRCode[];
  initialTotal: number;
  pageSize: number;
  initialFolders: FolderItem[];
  members: TeamMember[];
  /** Open already filtered to this folder (from a search result). */
  initialFolder?: string;
}

interface ListResponse {
  items: QRCode[];
  total: number;
}

const ALL_FOLDERS = 'all';
const NO_FOLDER = 'none';
const ANYONE = 'all';

export function QRCodeList({ initialItems, initialTotal, pageSize, initialFolders, members, initialFolder }: QRCodeListProps) {
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<QRType | 'all'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<QRCode | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const hasFetchedOnce = useRef(false);
  const [folders, setFolders] = useState(initialFolders);
  const [folderFilter, setFolderFilter] = useState(initialFolder ?? ALL_FOLDERS);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveTarget, setMoveTarget] = useState(NO_FOLDER);
  const [isMoving, setIsMoving] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  // Bumped to re-run the list fetch after a change made elsewhere on the page.
  const [reloadKey, setReloadKey] = useState(0);
  const [assignedFilter, setAssignedFilter] = useState(ANYONE);
  const [checkTarget, setCheckTarget] = useState<QRCode | null>(null);
  const [workflowTarget, setWorkflowTarget] = useState<QRCode | null>(null);

  const memberName = (id: string | null): string | null => (id ? (members.find((m) => m.id === id)?.name ?? null) : null);

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    // Skip the initial mount fetch — we already have server-rendered data for page 1 / no filters.
    if (!hasFetchedOnce.current) {
      hasFetchedOnce.current = true;
      return;
    }

    const controller = new AbortController();
    let ignore = false;

    // Deferred to a microtask so this isn't a synchronous setState call in
    // the effect body (react-hooks/set-state-in-effect).
    Promise.resolve().then(() => {
      if (!ignore) setIsLoading(true);
    });

    const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (typeFilter !== 'all') params.set('type', typeFilter);
    if (folderFilter !== ALL_FOLDERS) params.set('folder', folderFilter);
    if (assignedFilter !== ANYONE) params.set('assigned', assignedFilter);

    fetch(`/api/qr?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json() as Promise<ListResponse>)
      .then((data) => {
        if (ignore) return;
        setItems(data.items);
        setTotal(data.total);
      })
      .catch((error: unknown) => {
        if (ignore || controller.signal.aborted) return;
        toast.error('Failed to load QR codes.');
        console.error('QR list fetch error:', error);
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [page, debouncedSearch, typeFilter, folderFilter, assignedFilter, reloadKey, pageSize]);

  function handleSearchChange(next: string): void {
    setSearch(next);
    setPage(1);
  }

  function handleTypeFilterChange(next: QRType | 'all'): void {
    setTypeFilter(next);
    setPage(1);
  }

  function handleFolderFilterChange(next: string): void {
    setFolderFilter(next);
    setPage(1);
    setSelected(new Set());
  }

  function handleAssignedFilterChange(next: string): void {
    setAssignedFilter(next);
    setPage(1);
    setSelected(new Set());
  }

  function handleWorkflowSaved(id: string, next: WorkflowFields): void {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...next } : item)));
    // Filtered by assignee? The item may no longer belong in this view.
    if (assignedFilter !== ANYONE) setReloadKey((key) => key + 1);
  }

  function handleFoldersChange(next: FolderItem[]): void {
    setFolders(next);
    // A deleted folder's codes fall back to "No folder"; a filter on it is now empty.
    if (folderFilter !== ALL_FOLDERS && folderFilter !== NO_FOLDER && !next.some((f) => f.id === folderFilter)) {
      setFolderFilter(ALL_FOLDERS);
    }
    setReloadKey((key) => key + 1);
  }

  function toggleSelected(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage(): void {
    setSelected((prev) =>
      items.every((item) => prev.has(item.id)) ? new Set() : new Set(items.map((item) => item.id)),
    );
  }

  async function handleMove(): Promise<void> {
    setIsMoving(true);
    try {
      const response = await fetch('/api/qr/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], folderId: moveTarget === NO_FOLDER ? null : moveTarget }),
      });
      if (!response.ok) throw new Error('Request failed');

      const target = folders.find((f) => f.id === moveTarget)?.name ?? 'No folder';
      toast.success(`Moved ${selected.size} QR code${selected.size === 1 ? '' : 's'} to ${target}`);
      setSelected(new Set());
      setReloadKey((key) => key + 1);
    } catch (error) {
      toast.error('Failed to move the QR codes. Please try again.');
      console.error('QR move error:', error);
    } finally {
      setIsMoving(false);
    }
  }

  async function handleDuplicate(item: QRCode): Promise<void> {
    setDuplicatingId(item.id);
    try {
      const response = await fetch(`/api/qr/${item.id}/duplicate`, { method: 'POST' });
      if (!response.ok) throw new Error('Request failed');

      toast.success(`Duplicated "${item.name}"`);
      setPage(1);
      setReloadKey((key) => key + 1);
    } catch (error) {
      toast.error('Failed to duplicate the QR code. Please try again.');
      console.error('QR duplicate error:', error);
    } finally {
      setDuplicatingId(null);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!pendingDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/qr/${pendingDelete.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Request failed');

      setItems((prev) => prev.filter((item) => item.id !== pendingDelete.id));
      setTotal((prev) => prev - 1);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(pendingDelete.id);
        return next;
      });
      toast.success('QR code deleted');
    } catch (error) {
      toast.error('Failed to delete QR code. Please try again.');
      console.error('QR delete error:', error);
    } finally {
      setIsDeleting(false);
      setPendingDelete(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap">
          <div className="relative w-full sm:max-w-64 sm:flex-1">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name…"
              className="pl-8"
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => handleTypeFilterChange(v as QRType | 'all')}>
            <SelectTrigger className="w-full sm:w-48" aria-label="Type filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {QR_TYPES.map((qrType) => (
                <SelectItem key={qrType} value={qrType}>
                  {getQRTypeLabel(qrType)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={folderFilter} onValueChange={handleFolderFilterChange}>
            <SelectTrigger className="w-full sm:w-48" aria-label="Folder filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FOLDERS}>All folders</SelectItem>
              <SelectItem value={NO_FOLDER}>No folder</SelectItem>
              {folders.map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  {folder.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={assignedFilter} onValueChange={handleAssignedFilterChange}>
            <SelectTrigger className="w-full sm:w-48" aria-label="Assigned to filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANYONE}>Anyone</SelectItem>
              <SelectItem value="me">Assigned to me</SelectItem>
              <SelectItem value="none">Unassigned</SelectItem>
              {members.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setFolderDialogOpen(true)}>
            <FolderCog className="size-4" />
            Folders
          </Button>
          <Button asChild variant="outline">
            <Link href="/qr/compare">
              <GitCompareArrows className="size-4" />
              Compare
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/qr/batch">
              <FileSpreadsheet className="size-4" />
              Batch import
            </Link>
          </Button>
          <Button asChild>
            <Link href="/qr/new">
              <Plus className="size-4" />
              New QR Code
            </Link>
          </Button>
        </div>
      </div>

      {selected.size > 0 && (
        <div
          role="region"
          aria-label="Selection actions"
          className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm"
        >
          <span className="font-medium">{selected.size} selected</span>
          <Select value={moveTarget} onValueChange={setMoveTarget}>
            <SelectTrigger className="w-44" aria-label="Move to folder">
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
          <Button type="button" size="sm" disabled={isMoving} onClick={handleMove}>
            {isMoving ? 'Moving…' : 'Move'}
          </Button>
          {selected.size === 2 ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/qr/compare?a=${[...selected][0]}&b=${[...selected][1]}`}>
                <GitCompareArrows className="size-4" />
                Compare
              </Link>
            </Button>
          ) : (
            <span className="text-muted-foreground">Select exactly 2 to compare them.</span>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          {isLoading ? 'Loading…' : 'No QR codes yet.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={items.length > 0 && items.every((item) => selected.has(item.id))}
                    onChange={toggleAllOnPage}
                  />
                </TableHead>
                <TableHead className="w-16">Preview</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scans</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-44 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} data-state={selected.has(item.id) ? 'selected' : undefined}>
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`Select ${item.name}`}
                      checked={selected.has(item.id)}
                      onChange={() => toggleSelected(item.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <QRPreview
                      config={{
                        data: item.payload,
                        ...(item.styleConfig as QRStyleConfig),
                        cardLayout: 'none',
                      }}
                      size={40}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {item.name}
                    {item.folderId && (
                      <Badge variant="secondary" className="ml-2 font-normal">
                        {folders.find((f) => f.id === item.folderId)?.name ?? 'Folder'}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {getQRTypeLabel(item.qrType as QRType)}
                  </TableCell>
                  <TableCell>
                    {item.isDynamic ? (
                      <div className="flex gap-1.5">
                        <Badge variant="outline">Dynamic</Badge>
                        {item.isPaused && <Badge variant="destructive">Paused</Badge>}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Static</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.isDynamic ? (
                      <Link href={`/qr/${item.id}/analytics`} className="hover:underline">
                        {item.scanCount}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="max-w-56 text-sm">
                    {memberName(item.assignedTo) ? (
                      <Badge variant="outline" className="font-normal">
                        Assigned to {memberName(item.assignedTo)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                    {item.nextAction && <p className="mt-1 truncate text-muted-foreground" title={item.nextAction}>Next: {item.nextAction}</p>}
                    {(() => {
                      const progress = checklistProgress(normalizeChecklist(item.checklist));
                      return progress.total > 0 ? (
                        <p className="text-muted-foreground">Checklist {progress.done}/{progress.total}</p>
                      ) : null;
                    })()}
                    <p className="text-xs text-muted-foreground">
                      By {memberName(item.userId) ?? 'a teammate'}
                      {item.updatedBy && item.updatedBy !== item.userId ? `, edited by ${memberName(item.updatedBy) ?? 'a teammate'}` : ''}
                    </p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Check that ${item.name} is working`}
                        title="Is it working?"
                        onClick={() => setCheckTarget(item)}
                      >
                        <HeartPulse className="size-4" />
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
                        <Link href={`/qr/${item.id}`} aria-label={`Edit ${item.name}`}>
                          <Pencil className="size-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Duplicate ${item.name}`}
                        title="Duplicate"
                        disabled={duplicatingId === item.id}
                        onClick={() => handleDuplicate(item)}
                      >
                        <Copy className="size-4" />
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
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <FolderManager
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        folders={folders}
        onFoldersChange={handleFoldersChange}
      />

      <QrCheckDialog qrId={checkTarget?.id ?? null} qrName={checkTarget?.name ?? ''} onOpenChange={(open) => !open && setCheckTarget(null)} />

      {workflowTarget && (
        <WorkflowDialog
          key={workflowTarget.id}
          kind="qr"
          itemId={workflowTarget.id}
          itemName={workflowTarget.name}
          value={workflowTarget}
          members={members}
          open
          onOpenChange={(open) => !open && setWorkflowTarget(null)}
          onSaved={(next) => handleWorkflowSaved(workflowTarget.id, next)}
        />
      )}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this QR code?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.name} will be removed for the whole team. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isDeleting} onClick={handleDelete}>
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
