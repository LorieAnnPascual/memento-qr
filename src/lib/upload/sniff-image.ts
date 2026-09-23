export type ImageKind = 'png' | 'jpeg' | 'webp' | 'svg';

export const MIME_FOR_KIND: Record<ImageKind, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

/** Extension used for stored files. Chosen from the verified type, never from the uploaded file name. */
export const EXTENSION_FOR_KIND: Record<ImageKind, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
  svg: 'svg',
};

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

// Scripts inside an SVG run if someone opens the file's address directly.
const UNSAFE_SVG = /<script|<foreignObject|\son[a-z]+\s*=|javascript:|<iframe|<embed|<object/i;

/**
 * Identifies an image from its first bytes, ignoring whatever name or content
 * type the browser claimed. Returns null for anything that is not a PNG, JPEG,
 * WebP or a script-free SVG.
 */
export function sniffImage(bytes: Uint8Array): { kind: ImageKind } | { kind: null; reason: 'unknown' | 'unsafe-svg' } {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: 'png' };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: 'jpeg' };
  // WebP: "RIFF" .... "WEBP"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { kind: 'webp' };
  }

  // SVG is text. Look at the start of the file only, ignoring a BOM and whitespace.
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 2048)).replace(/^﻿/, '').trimStart();
  if (/^(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) {
    const whole = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    return UNSAFE_SVG.test(whole) ? { kind: null, reason: 'unsafe-svg' } : { kind: 'svg' };
  }

  return { kind: null, reason: 'unknown' };
}
