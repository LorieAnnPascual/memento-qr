import { describe, it, expect } from 'vitest';

import { EXTENSION_FOR_KIND, MIME_FOR_KIND, sniffImage } from '@/lib/upload/sniff-image';

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);

describe('sniffImage', () => {
  it('recognises PNG, JPEG and WebP by their signatures', () => {
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toEqual({ kind: 'png' });
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toEqual({ kind: 'jpeg' });
    expect(sniffImage(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toEqual({ kind: 'webp' });
  });

  it('does not mistake other RIFF files (like WAV audio) for WebP', () => {
    expect(sniffImage(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45))).toMatchObject({ kind: null });
  });

  it('recognises plain SVG, with or without an XML prolog or leading whitespace', () => {
    expect(sniffImage(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toEqual({ kind: 'svg' });
    expect(sniffImage(text('  \n<?xml version="1.0"?>\n<svg width="1"></svg>'))).toEqual({ kind: 'svg' });
    expect(sniffImage(text('﻿<svg></svg>'))).toEqual({ kind: 'svg' });
  });

  it.each([
    ['a script element', '<svg><script>alert(1)</script></svg>'],
    ['an inline event handler', '<svg><rect onload="alert(1)"/></svg>'],
    ['a javascript: link', '<svg><a href="javascript:alert(1)"><rect/></a></svg>'],
    ['a foreignObject', '<svg><foreignObject><div/></foreignObject></svg>'],
  ])('refuses an SVG with %s', (_label, svg) => {
    expect(sniffImage(text(svg))).toEqual({ kind: null, reason: 'unsafe-svg' });
  });

  it.each([
    ['a Windows executable', bytes(0x4d, 0x5a, 0x90, 0x00)],
    ['a ZIP archive', bytes(0x50, 0x4b, 0x03, 0x04)],
    ['an HTML page', text('<html><body>hi</body></html>')],
    ['plain text', text('hello')],
    ['an empty file', bytes()],
    ['a GIF', text('GIF89a....')],
  ])('refuses %s', (_label, data) => {
    expect(sniffImage(data)).toEqual({ kind: null, reason: 'unknown' });
  });

  it('maps every kind to one MIME type and one extension', () => {
    expect(MIME_FOR_KIND).toEqual({ png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' });
    expect(EXTENSION_FOR_KIND).toEqual({ png: 'png', jpeg: 'jpg', webp: 'webp', svg: 'svg' });
  });
});
