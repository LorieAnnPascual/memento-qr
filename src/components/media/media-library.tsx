'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Trash2, Upload } from 'lucide-react';

import type { UploadedFile } from '@/lib/db/schema';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useImageUpload } from '@/hooks/use-image-upload';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

interface MediaLibraryProps {
  initialFiles: UploadedFile[];
}

export function MediaLibrary({ initialFiles }: MediaLibraryProps) {
  const [files, setFiles] = useState(initialFiles);
  const [pendingDelete, setPendingDelete] = useState<UploadedFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isUploading, handleFileChange } = useImageUpload({
    onUploaded: (file) => {
      setFiles((prev) => [file, ...prev]);
      toast.success('Media uploaded');
    },
  });

  async function handleDelete(): Promise<void> {
    if (!pendingDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/upload/${pendingDelete.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Request failed');

      setFiles((prev) => prev.filter((file) => file.id !== pendingDelete.id));
      toast.success('Media deleted');
    } catch (error) {
      toast.error('Failed to delete media. Please try again.');
      console.error('Media delete error:', error);
    } finally {
      setIsDeleting(false);
      setPendingDelete(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button type="button" disabled={isUploading} onClick={() => fileInputRef.current?.click()}>
          <Upload className="size-4" />
          {isUploading ? 'Uploading…' : 'Upload media'}
        </Button>
      </div>

      {files.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          No media uploaded yet. Logos and card backgrounds you upload from the QR designer show up
          here too.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {files.map((file) => (
            <div key={file.id} className="group relative flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted/50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={file.publicUrl} alt={file.fileName} className="max-h-full max-w-full object-contain" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" title={file.fileName}>
                  {file.fileName}
                </p>
                <p className="text-xs text-muted-foreground">{formatBytes(file.fileSize)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${file.fileName}`}
                className="absolute top-2 right-2 bg-background/80 opacity-0 group-hover:opacity-100"
                onClick={() => setPendingDelete(file)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this media file?"
        description={`${pendingDelete?.fileName ?? ''} will be permanently deleted. QR codes or cards already using it will show a broken image.`}
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        variant="destructive"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
