'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Link2, Trash2, Upload } from 'lucide-react';

import type { UploadedFile } from '@/lib/db/schema';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useImageUpload } from '@/hooks/use-image-upload';
import { useVideoUpload } from '@/hooks/use-video-upload';
import {
  FREE_STORAGE_BYTES,
  IMAGE_ACCEPT,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  VIDEO_ACCEPT,
  formatBytes,
  isVideoMime,
  videoKindForFile,
} from '@/lib/upload/media-types';

interface MediaLibraryProps {
  initialFiles: UploadedFile[];
}

export function MediaLibrary({ initialFiles }: MediaLibraryProps) {
  const [files, setFiles] = useState(initialFiles);
  const [pendingDelete, setPendingDelete] = useState<UploadedFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isUploading: isUploadingImage, handleFileChange: handleImageChange } = useImageUpload({
    onUploaded: (file) => {
      setFiles((prev) => [file, ...prev]);
      toast.success('Media uploaded');
    },
  });
  const { isUploading: isUploadingVideo, progress, upload: uploadVideo } = useVideoUpload();
  const isUploading = isUploadingImage || isUploadingVideo;

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;

    // Videos upload straight to storage; images keep using our own (small-file) route.
    if (videoKindForFile(file)) {
      event.target.value = '';
      const uploaded = await uploadVideo(file);
      if (uploaded) {
        setFiles((prev) => [uploaded, ...prev]);
        toast.success('Video uploaded');
      }
      return;
    }
    void handleImageChange(event);
  }

  async function handleCopyLink(file: UploadedFile): Promise<void> {
    try {
      await navigator.clipboard.writeText(file.publicUrl);
      toast.success('Link copied');
    } catch (error) {
      toast.error('Could not copy the link.');
      console.error('Copy link error:', error);
    }
  }

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

  const usedBytes = files.reduce((sum, file) => sum + file.fileSize, 0);
  const nearlyFull = usedBytes >= FREE_STORAGE_BYTES * 0.8;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={`${IMAGE_ACCEPT},${VIDEO_ACCEPT}`}
          className="hidden"
          onChange={(event) => void handleFileChange(event)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={isUploading} onClick={() => fileInputRef.current?.click()}>
            <Upload className="size-4" />
            {isUploadingVideo ? `Uploading video… ${progress}%` : isUploadingImage ? 'Uploading…' : 'Upload media'}
          </Button>
          {isUploadingVideo && (
            <div
              role="progressbar"
              aria-label="Video upload progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="h-2 w-40 overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Images (PNG, JPG, WebP, SVG) up to {formatBytes(MAX_IMAGE_BYTES)}. Videos (MP4, WebM, MOV) up to{' '}
          {formatBytes(MAX_VIDEO_BYTES)}. Keep the tab open while a video uploads.
        </p>
        <p className={nearlyFull ? 'text-sm font-medium text-destructive' : 'text-sm text-muted-foreground'}>
          Storage used: {formatBytes(usedBytes)} of {formatBytes(FREE_STORAGE_BYTES)} (free plan)
          {nearlyFull ? '. Delete files you no longer need before uploading more.' : ''}
        </p>
      </div>

      {files.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          No media uploaded yet. Logos and card backgrounds you upload from the QR designer show up here too, and so do
          videos you upload.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {files.map((file) => (
            <div key={file.id} className="group relative flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted/50">
                {isVideoMime(file.mimeType) ? (
                  <video
                    src={`${file.publicUrl}#t=0.1`}
                    controls
                    preload="metadata"
                    playsInline
                    aria-label={file.fileName}
                    className="max-h-full max-w-full"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={file.publicUrl} alt={file.fileName} className="max-h-full max-w-full object-contain" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" title={file.fileName}>
                  {file.fileName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isVideoMime(file.mimeType) ? 'Video · ' : ''}
                  {formatBytes(file.fileSize)}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="xs"
                aria-label={`Copy link to ${file.fileName}`}
                onClick={() => void handleCopyLink(file)}
              >
                <Link2 className="size-3" />
                Copy link
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${file.fileName}`}
                className="absolute top-2 right-2 bg-background/80 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
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
        description={`${pendingDelete?.fileName ?? ''} will be permanently deleted. QR codes, cards and pages already using it will show a broken image or video.`}
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        variant="destructive"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
