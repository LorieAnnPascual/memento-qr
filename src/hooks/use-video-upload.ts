'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { uploadVideo, type UploadedVideo } from '@/lib/upload/upload-video';

/** Upload state for one video at a time; failures are reported with a toast and resolve to null. */
export function useVideoUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function upload(file: File): Promise<UploadedVideo | null> {
    setIsUploading(true);
    setProgress(0);
    try {
      return await uploadVideo(file, (fraction) => setProgress(Math.round(fraction * 100)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload the video. Please try again.');
      console.error('Video upload error:', error);
      return null;
    } finally {
      setIsUploading(false);
    }
  }

  return { isUploading, progress, upload };
}
