import type { VideoKind } from './media-types';

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

// MP4 and MOV share one container format ("ftyp" box), and editing tools, phones and cameras
// write dozens of different brand codes, so listing the good ones would refuse real videos.
// Instead, refuse the brands that mean something else in the same box layout: still images
// (HEIC, AVIF, JPEG 2000) and audio-only files.
const NOT_VIDEO_BRANDS = new Set([
  'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'avif', 'avis', 'jp2 ', 'jpx ', 'crx ',
  'M4A ', 'M4B ', 'M4P ',
]);

/**
 * Identifies a video from its first bytes, ignoring the name and content type
 * the browser claimed. Returns null for anything that is not MP4, MOV or WebM.
 */
export function sniffVideo(bytes: Uint8Array): VideoKind | null {
  // WebM / Matroska: EBML header.
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'webm';
  }

  // MP4 / MOV: a box whose type is "ftyp" at offset 4, followed by the major brand.
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (NOT_VIDEO_BRANDS.has(brand)) return null;
    return brand === 'qt  ' ? 'mov' : 'mp4';
  }

  return null;
}
