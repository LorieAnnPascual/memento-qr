'use client';

import { useRef, useState } from 'react';

import { FieldLabel } from '@puckeditor/core';
import { toast } from 'sonner';
import { Trash2, Upload } from 'lucide-react';

const UPLOAD_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';

interface ImageFieldInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

/** Puck custom field: paste an image URL or upload one (uses /api/upload). */
export function ImageFieldInput({ label, value, onChange, readOnly }: ImageFieldInputProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleFile(file: File): Promise<void> {
    setIsUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/upload', { method: 'POST', body });
      const result = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error ?? 'Upload failed');

      onChange(result.url);
      toast.success('Image uploaded');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed. Please try again.');
      console.error('Page image upload error:', error);
    } finally {
      setIsUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
  } as const;
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
    <FieldLabel label={label ?? 'Image'}>
    <div style={{ display: 'grid', gap: 8 }}>
      <input
        type="text"
        value={value}
        readOnly={readOnly}
        placeholder="https://… or upload"
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          disabled={readOnly || isUploading}
          onClick={() => fileInput.current?.click()}
          style={buttonStyle}
        >
          <Upload size={14} />
          {isUploading ? 'Uploading…' : 'Upload image'}
        </button>
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
        accept={UPLOAD_ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <p style={{ fontSize: 12, color: '#6b7280' }}>PNG, JPG, WebP or SVG, up to 500KB.</p>
      {value && (
        // eslint-disable-next-line @next/next/no-img-element -- editor-only thumbnail of an arbitrary URL
        <img
          src={value}
          alt=""
          style={{ maxHeight: 96, objectFit: 'contain', borderRadius: 6, background: '#f3f4f6' }}
        />
      )}
    </div>
    </FieldLabel>
  );
}
