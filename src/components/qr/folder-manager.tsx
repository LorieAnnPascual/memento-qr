'use client';

import { useState } from 'react';

import { toast } from 'sonner';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export interface FolderItem {
  id: string;
  name: string;
  qrCount?: number;
}

interface FolderManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: FolderItem[];
  onFoldersChange: (folders: FolderItem[]) => void;
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

export function FolderManager({ open, onOpenChange, folders, onFoldersChange }: FolderManagerProps) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<FolderItem | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function handleCreate(): Promise<void> {
    if (!newName.trim()) return;
    setIsBusy(true);
    try {
      const response = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (!response.ok) throw new Error(await readError(response, 'Failed to create the folder.'));

      const created = (await response.json()) as FolderItem;
      onFoldersChange([...folders, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
      toast.success('Folder created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create the folder.');
      console.error('Folder create error:', error);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRename(folder: FolderItem): Promise<void> {
    if (!editName.trim()) return;
    setIsBusy(true);
    try {
      const response = await fetch(`/api/folders/${folder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName }),
      });
      if (!response.ok) throw new Error(await readError(response, 'Failed to rename the folder.'));

      const updated = (await response.json()) as FolderItem;
      onFoldersChange(
        folders
          .map((item) => (item.id === folder.id ? { ...item, name: updated.name } : item))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditingId(null);
      toast.success('Folder renamed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to rename the folder.');
      console.error('Folder rename error:', error);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!pendingDelete) return;
    setIsBusy(true);
    try {
      const response = await fetch(`/api/folders/${pendingDelete.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await readError(response, 'Failed to delete the folder.'));

      onFoldersChange(folders.filter((item) => item.id !== pendingDelete.id));
      toast.success('Folder deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete the folder.');
      console.error('Folder delete error:', error);
    } finally {
      setIsBusy(false);
      setPendingDelete(null);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Folders</DialogTitle>
            <DialogDescription>Group related QR codes together.</DialogDescription>
          </DialogHeader>

          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreate();
            }}
          >
            <Input
              aria-label="New folder name"
              placeholder="New folder name"
              value={newName}
              maxLength={100}
              onChange={(event) => setNewName(event.target.value)}
            />
            <Button type="submit" disabled={isBusy || !newName.trim()}>
              <Plus className="size-4" />
              Add
            </Button>
          </form>

          {folders.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No folders yet.</p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {folders.map((folder) => (
                <li key={folder.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                  {editingId === folder.id ? (
                    <>
                      <Input
                        aria-label={`Rename ${folder.name}`}
                        value={editName}
                        maxLength={100}
                        autoFocus
                        onChange={(event) => setEditName(event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && void handleRename(folder)}
                      />
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Save name"
                        disabled={isBusy}
                        onClick={() => handleRename(folder)}
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Cancel rename"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 truncate font-medium">{folder.name}</span>
                      {folder.qrCount !== undefined && (
                        <span className="text-xs text-muted-foreground">{folder.qrCount} QR</span>
                      )}
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Rename ${folder.name}`}
                        onClick={() => {
                          setEditingId(folder.id);
                          setEditName(folder.name);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Delete ${folder.name}`}
                        onClick={() => setPendingDelete(folder)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => !next && setPendingDelete(null)}
        title="Delete this folder?"
        description={`"${pendingDelete?.name ?? ''}" will be deleted. The QR codes inside are kept and move to "No folder".`}
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        variant="destructive"
        isPending={isBusy}
        onConfirm={handleDelete}
      />
    </>
  );
}
