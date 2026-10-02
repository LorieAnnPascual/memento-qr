import { describe, it, expect } from 'vitest';

import { bytesFitExtension, formatBytes, isVideoMime, videoKindForFile, videoKindForMime } from '@/lib/upload/media-types';
import { sniffVideo } from '@/lib/upload/sniff-video';

const ftyp = (brand: string): Uint8Array =>
  new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, ...[...brand].map((c) => c.charCodeAt(0)), 0, 0, 0, 0]);

describe('sniffVideo', () => {
  it('recognises MP4 files by their ftyp brand, including less common ones from editing tools and phones', () => {
    for (const brand of ['isom', 'mp42', 'avc1', 'M4V ', 'iso2', 'iso6', 'mp71', '3gp5', 'MSNV', 'dby1', 'mmp4']) {
      expect(sniffVideo(ftyp(brand))).toBe('mp4');
    }
  });

  it('recognises QuickTime MOV files', () => {
    expect(sniffVideo(ftyp('qt  '))).toBe('mov');
  });

  it('recognises WebM files', () => {
    expect(sniffVideo(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00]))).toBe('webm');
  });

  it('refuses HEIC and AVIF images and audio-only files, which share the MP4 box layout', () => {
    for (const brand of ['heic', 'heix', 'mif1', 'avif', 'M4A ', 'M4B ']) {
      expect(sniffVideo(ftyp(brand))).toBeNull();
    }
  });

  it('refuses other files, however they are named', () => {
    expect(sniffVideo(new TextEncoder().encode('<!DOCTYPE html><script>alert(1)</script>'))).toBeNull();
    expect(sniffVideo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull();
    expect(sniffVideo(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull(); // Windows executable
  });

  it('refuses empty and truncated input', () => {
    expect(sniffVideo(new Uint8Array([]))).toBeNull();
    expect(sniffVideo(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79]))).toBeNull();
  });
});

describe('media types', () => {
  it('maps content types and file names to a video kind', () => {
    expect(videoKindForMime('video/mp4')).toBe('mp4');
    expect(videoKindForMime('video/quicktime')).toBe('mov');
    expect(videoKindForMime('image/png')).toBeNull();
    expect(isVideoMime('video/webm')).toBe(true);
    expect(isVideoMime('image/webp')).toBe(false);
  });

  it('falls back to the extension when the browser reports no type (common for .mov)', () => {
    expect(videoKindForFile({ name: 'Clip.MOV', type: '' })).toBe('mov');
    expect(videoKindForFile({ name: 'clip.mp4', type: 'application/octet-stream' })).toBe('mp4');
    expect(videoKindForFile({ name: 'clip.avi', type: '' })).toBeNull();
    expect(videoKindForFile({ name: 'photo.png', type: 'image/png' })).toBeNull();
  });

  it('formats sizes for people', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(50 * 1024 * 1024)).toBe('50.0 MB');
    expect(formatBytes(1024 ** 3)).toBe('1.00 GB');
  });
});


describe('bytesFitExtension', () => {
  it('lets MP4 and MOV stand in for each other (same container)', () => {
    expect(bytesFitExtension('mov', 'mp4')).toBe(true);
    expect(bytesFitExtension('mp4', 'mov')).toBe(true);
    expect(bytesFitExtension('mp4', 'mp4')).toBe(true);
  });

  it('keeps WebM separate and refuses unknown bytes', () => {
    expect(bytesFitExtension('webm', 'webm')).toBe(true);
    expect(bytesFitExtension('mp4', 'webm')).toBe(false);
    expect(bytesFitExtension('webm', 'mp4')).toBe(false);
    expect(bytesFitExtension(null, 'mp4')).toBe(false);
  });
});
