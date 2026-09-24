'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Images } from 'lucide-react';

import type { UploadedFile } from '@/lib/db/schema';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface MediaPickerButtonProps {
  /** Called with the chosen image's public URL. */
  onSelect: (url: string) => void;
  disabled?: boolean;
  label?: string;
}

/** "Choose from media" button: opens the team member's uploaded images so one can be reused. */
export function MediaPickerButton({ onSelect, disabled, label = 'Choose from media' }: MediaPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<UploadedFile[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function openPicker(): Promise<void> {
    setOpen(true);
    setIsLoading(true);
    try {
      const response = await fetch('/api/upload');
      if (!response.ok) throw new Error('Failed to load media');
      const result = (await response.json()) as { files: UploadedFile[] };
      setFiles(result.files);
    } catch (error) {
      toast.error('Could not load your media. Please try again.');
      console.error('Media picker load error:', error);
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => void openPicker()}>
        <Images className="size-4" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" style={{ zIndex: 100000 }}>
          <DialogHeader>
            <DialogTitle>Choose from media</DialogTitle>
            <DialogDescription>Pick an image you have already uploaded.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : files && files.length > 0 ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {files.map((file) => (
                  <li key={file.id}>
                    <button
                      type="button"
                      className="w-full rounded-lg border p-2 text-left transition-colors hover:border-primary hover:bg-muted focus-visible:outline-2"
                      onClick={() => {
                        onSelect(file.publicUrl);
                        setOpen(false);
                      }}
                    >
                      <div className="flex h-24 items-center justify-center overflow-hidden rounded bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={file.publicUrl} alt="" className="max-h-full max-w-full object-contain" />
                      </div>
                      <p className="mt-1 truncate text-xs" title={file.fileName}>
                        {file.fileName}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No uploaded images yet. Upload one first and it will show up here.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
