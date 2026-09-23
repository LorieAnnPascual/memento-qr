'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import type { UploadedFile } from '@/lib/db/schema';

const MAX_UPLOAD_BYTES = 500 * 1024;

interface UseImageUploadOptions {
  onUploaded: (file: UploadedFile) => void;
}

export function useImageUpload({ onUploaded }: UseImageUploadOptions) {
  const [isUploading, setIsUploading] = useState(false);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('Image must be smaller than 500KB.');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', { method: 'POST', body: formData });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const uploaded = (await response.json()) as UploadedFile & { url: string };
      onUploaded(uploaded);
    } catch (error) {
      toast.error('Failed to upload image. Please try again.');
      console.error('Image upload error:', error);
    } finally {
      setIsUploading(false);
    }
  }

  return { isUploading, handleFileChange };
}
