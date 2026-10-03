'use client';

import { useRef, type ReactNode } from 'react';

import { toast } from 'sonner';
import { Trash2, Upload } from 'lucide-react';

import { MediaPickerButton } from '@/components/media/media-picker';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useVideoUpload } from '@/hooks/use-video-upload';
import { MAX_VIDEO_BYTES, VIDEO_ACCEPT, formatBytes, toOwnMediaUrl } from '@/lib/upload/media-types';
import type { VideoFormValues } from '@/types/qr';

interface VideoFormProps {
  values: VideoFormValues;
  onChange: (values: VideoFormValues) => void;
  /** Rendered right under the picker (the custom link name field). */
  children?: ReactNode;
}

export function VideoForm({ values, onChange, children }: VideoFormProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { isUploading, progress, upload } = useVideoUpload();

  async function handleFile(file: File): Promise<void> {
    const uploaded = await upload(file);
    if (uploaded) {
      onChange({ videoUrl: uploaded.url, fileName: uploaded.fileName, fileSize: uploaded.fileSize });
      toast.success('Video uploaded');
    }
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="qr-video-file">Video</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading}
            data-testid="video-upload-button"
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="size-4" />
            {isUploading ? `Uploading… ${progress}%` : values.videoUrl ? 'Upload a different video' : 'Upload video'}
          </Button>
          <MediaPickerButton
            kind="video"
            disabled={isUploading}
            label="From media"
            onSelect={(url, file) =>
              onChange({ videoUrl: toOwnMediaUrl(url), fileName: file.fileName, fileSize: file.fileSize })
            }
          />
          {values.videoUrl && !isUploading && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ videoUrl: '', fileName: '', fileSize: 0 })}
            >
              <Trash2 className="size-4" />
              Remove
            </Button>
          )}
        </div>
        <input
          ref={fileInput}
          id="qr-video-file"
          data-testid="video-file-input"
          type="file"
          accept={VIDEO_ACCEPT}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        {isUploading && (
          <div
            role="progressbar"
            aria-label="Video upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-2 w-full overflow-hidden rounded bg-muted"
          >
            <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          MP4, WebM or MOV, up to {formatBytes(MAX_VIDEO_BYTES)}. The video is kept in your Media library, and
          scanning the code plays it.
        </p>
      </div>

      {values.videoUrl && (
        <div className="space-y-2" data-testid="video-selected">
          <video
            src={`${values.videoUrl}#t=0.1`}
            controls
            preload="metadata"
            playsInline
            className="max-h-56 w-full rounded-md bg-black"
          />
          <p className="text-sm" data-testid="video-file-meta">
            <span className="font-medium">{values.fileName || 'Video'}</span>
            {values.fileSize > 0 && <span className="text-muted-foreground"> · {formatBytes(values.fileSize)}</span>}
          </p>
        </div>
      )}

      {children}
    </div>
  );
}
