'use client';

import { useRef } from 'react';

import { FieldLabel } from '@puckeditor/core';
import { toast } from 'sonner';
import { Trash2, Upload } from 'lucide-react';

import { MediaPickerButton } from '@/components/media/media-picker';
import { useVideoUpload } from '@/hooks/use-video-upload';
import { MAX_VIDEO_BYTES, VIDEO_ACCEPT, formatBytes } from '@/lib/upload/media-types';

interface VideoFieldInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

/** Puck custom field: upload a video (straight to storage) or reuse one from the Media library. */
export function VideoFieldInput({ label, value, onChange, readOnly }: VideoFieldInputProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { isUploading, progress, upload } = useVideoUpload();

  async function handleFile(file: File): Promise<void> {
    const uploaded = await upload(file);
    if (uploaded) {
      onChange(uploaded.url);
      toast.success('Video uploaded');
    }
    if (fileInput.current) fileInput.current.value = '';
  }

  const buttonStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 13,
    background: '#fff',
    cursor: 'pointer',
  } as const;

  return (
    <FieldLabel label={label ?? 'Uploaded video'}>
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            // Puck wraps the whole field in one <label>, which would otherwise become this button's name.
            aria-label="Upload video"
            disabled={readOnly || isUploading}
            onClick={() => fileInput.current?.click()}
            style={buttonStyle}
          >
            <Upload size={14} />
            {isUploading ? `Uploading… ${progress}%` : 'Upload video'}
          </button>
          <MediaPickerButton kind="video" disabled={readOnly || isUploading} onSelect={onChange} label="From media" />
          {value && (
            <button type="button" disabled={readOnly} onClick={() => onChange('')} style={buttonStyle}>
              <Trash2 size={14} />
              Remove
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={VIDEO_ACCEPT}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <p style={{ fontSize: 12, color: '#6b7280' }}>
          MP4, WebM or MOV, up to {formatBytes(MAX_VIDEO_BYTES)}. It plays from this app, so the page works without
          YouTube.
        </p>
        {value && (
          <video
            src={`${value}#t=0.1`}
            controls
            preload="metadata"
            playsInline
            style={{ maxHeight: 140, borderRadius: 6, background: '#000' }}
          />
        )}
      </div>
    </FieldLabel>
  );
}
