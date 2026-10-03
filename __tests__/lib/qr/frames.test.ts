import { describe, it, expect } from 'vitest';

import { buildFramedSvg, plateColorFor, prefixIds } from '@/lib/qr/frames/build';
import { safeHex, mixHex, readableOn } from '@/lib/qr/frames/color';
import { cleanCaption, defaultFrameConfig, MAX_CAPTION_LENGTH, resolveFrame } from '@/lib/qr/frames/config';
import { qrModuleCount } from '@/lib/qr/frames/framed-image';
import { frameGeometry, qrShareOfWidth } from '@/lib/qr/frames/layout';
import { FRAMES, FRAME_IDS, framesByOccasion, getFrameDefinition } from '@/lib/qr/frames/registry';
import { checkDesign } from '@/lib/qr/design-checks';
import { CreateQRSchema } from '@/lib/qr/schemas';
import { createQRCode } from '@/lib/qr/generator';

const QR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><defs><clipPath id="clip-a"><rect width="300" height="300"/></clipPath></defs><rect width="300" height="300" fill="#fff"/><rect x="10" y="10" width="40" height="40" clip-path="url(#clip-a)"/></svg>';

function parse(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  return doc;
}

describe('frame registry', () => {
  it('has the eight designs, each complete', () => {
    expect([...FRAME_IDS].sort()).toEqual(
      ['baby', 'birthday', 'business', 'graduation', 'memorial', 'pets', 'simple', 'wedding'].sort(),
    );
    for (const frame of FRAMES) {
      expect(frame.label.length).toBeGreaterThan(0);
      expect(frame.description.length).toBeGreaterThan(0);
      expect(frame.occasion).toBeTruthy();
      expect(frame.defaultColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(frame.defaultAccent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(frame.defaultCaption.length).toBeGreaterThan(0);
      expect(frame.defaultCaption.length).toBeLessThanOrEqual(MAX_CAPTION_LENGTH);
      expect(typeof frame.render).toBe('function');
    }
  });

  it('has unique ids and groups every design under an occasion', () => {
    expect(new Set(FRAME_IDS).size).toBe(FRAME_IDS.length);
    const grouped = framesByOccasion().flatMap((group) => group.frames.map((f) => f.id));
    expect(grouped.sort()).toEqual([...FRAME_IDS].sort());
  });

  it('looks designs up by id and ignores unknown ones', () => {
    expect(getFrameDefinition('wedding')?.label).toBe('Wedding');
    expect(getFrameDefinition('nope')).toBeNull();
    expect(getFrameDefinition(undefined)).toBeNull();
  });
});

describe.each(FRAME_IDS)('frame "%s"', (id) => {
  it.each([21, 29, 33, 57, 97, 177, null])('renders well-formed SVG for a code with %s modules', (modules) => {
    for (const caption of [undefined, '']) {
      const framed = buildFramedSvg(QR_SVG, { frame: { id, caption }, modules });
      expect(framed).not.toBeNull();
      const doc = parse(framed!.svg);
      expect(doc.documentElement.getAttribute('data-frame')).toBe(id);
    }
  });

  it.each([100, 360, 1000, 2400])('renders at %s px wide with the code inside the picture', (width) => {
    const framed = buildFramedSvg(QR_SVG, { frame: { id }, modules: 33, width })!;
    expect(framed.width).toBe(width);
    const { qrRect } = framed;
    expect(qrRect.x).toBeGreaterThan(0);
    expect(qrRect.y).toBeGreaterThan(0);
    expect(qrRect.x + qrRect.width).toBeLessThan(framed.width);
    expect(qrRect.y + qrRect.height).toBeLessThan(framed.height);
  });

  it('puts the code on a clear plate that is painted over the art, with the caption after it', () => {
    const { svg } = buildFramedSvg(QR_SVG, { frame: { id }, modules: 33 })!;
    const art = svg.indexOf('data-part="art"');
    const plate = svg.indexOf('data-part="plate"');
    const qr = svg.indexOf('data-part="qr"');
    expect(art).toBeLessThan(plate);
    expect(plate).toBeLessThan(qr);
    expect(svg.indexOf('<text')).toBeGreaterThan(qr);
  });

  it('leaves at least the 4-module quiet zone round the code', () => {
    for (const modules of [21, 29, 33, 57, 97, 177]) {
      const g = frameGeometry(modules, true);
      const quietInModules = (g.quiet / g.qr.width) * modules;
      // Very dense codes use a floor in units; they are still wider than 3 modules.
      expect(quietInModules).toBeGreaterThanOrEqual(Math.min(4, (70 / 1000) * modules) - 1e-9);
      expect(g.qr.x - g.plate.x).toBe(g.quiet);
      expect(g.plate.x + g.plate.width - (g.qr.x + g.qr.width)).toBe(g.quiet);
    }
    void id;
  });

  it('adds the caption text, uppercased only when the design asks for it', () => {
    const framed = buildFramedSvg(QR_SVG, { frame: { id, caption: 'Hello there' }, modules: 33 })!;
    const text = parse(framed.svg).getElementsByTagName('text')[0];
    expect(text.textContent?.toLowerCase()).toBe('hello there');
    expect(framed.caption?.text.toLowerCase()).toBe('hello there');
  });

  it('can leave the caption text out for the browser to draw', () => {
    const framed = buildFramedSvg(QR_SVG, { frame: { id, caption: 'Hi' }, modules: 33, includeCaption: false })!;
    expect(framed.svg).not.toContain('<text');
    expect(framed.caption).not.toBeNull();
  });
});

describe('framed picture size', () => {
  it('keeps the code at about 70% of the width or more for any normal code', () => {
    for (const modules of [29, 33, 37, 45, 57, 77, 97, 177]) {
      expect(qrShareOfWidth(frameGeometry(modules, true))).toBeGreaterThanOrEqual(0.685);
      expect(qrShareOfWidth(frameGeometry(modules, false))).toBeGreaterThanOrEqual(0.685);
    }
    // The default (typical short link) is comfortably above 70%.
    expect(qrShareOfWidth(frameGeometry(null, true))).toBeGreaterThanOrEqual(0.7);
  });

  it('sizes the picture from the code size when asked', () => {
    const framed = buildFramedSvg(QR_SVG, { frame: { id: 'simple' }, modules: 33, qrPixels: 1024 })!;
    expect(framed.qrRect.width).toBeCloseTo(1024, 0);
  });
});

describe('caption safety', () => {
  const hostile = ['<script>alert(1)</script>', '"quoted" & \'single\'', 'a & b < c > d', 'emoji \u{1F389}\u{1F436}', 'tab\there\nnewline'];

  it.each(hostile)('escapes %j so the SVG stays well-formed and carries no markup from the caption', (caption) => {
    const framed = buildFramedSvg(QR_SVG, { frame: { id: 'wedding', caption }, modules: 33 })!;
    const doc = parse(framed.svg);
    expect(doc.getElementsByTagName('script')).toHaveLength(0);
    expect(framed.svg).not.toContain('<script');
    const text = doc.getElementsByTagName('text')[0].textContent ?? '';
    expect(text).toBe(cleanCaption(caption));
  });

  it('cleans captions: one line, at most 50 characters, no control characters', () => {
    expect(MAX_CAPTION_LENGTH).toBe(50);
    expect(cleanCaption('  a \n\n b  ')).toBe('a b');
    expect(cleanCaption('x'.repeat(80))).toHaveLength(MAX_CAPTION_LENGTH);
    expect(cleanCaption('x'.repeat(50))).toHaveLength(50);
    expect(cleanCaption('bad\u0000\u0007char')).toBe('badchar');
    expect(Array.from(cleanCaption('\u{1F389}'.repeat(80)))).toHaveLength(MAX_CAPTION_LENGTH);
    expect(cleanCaption('lone\uD800surrogate')).toBe('lonesurrogate');
  });

  it('uses the design caption when none is set and none when it is empty', () => {
    expect(resolveFrame({ id: 'pets' })?.caption).toBe('Meet our pet');
    expect(resolveFrame({ id: 'pets', caption: '' })?.caption).toBe('');
    expect(resolveFrame({ id: 'pets', caption: '   ' })?.caption).toBe('');
  });
});

describe('colours', () => {
  it('accepts only #rgb and #rrggbb', () => {
    expect(safeHex('#ABC', '#000000')).toBe('#aabbcc');
    expect(safeHex(' #112233 ', '#000000')).toBe('#112233');
    for (const bad of ['red', 'rgb(1,2,3)', '#12', '#1234', '#12345678', 'url(javascript:1)', '"/><script>', undefined, 5]) {
      expect(safeHex(bad, '#abcdef')).toBe('#abcdef');
    }
  });

  it('falls back to the design colours for missing or invalid values, and never puts them in the SVG raw', () => {
    const resolved = resolveFrame({ id: 'simple', color: 'not-a-colour', accentColor: '"><script>' });
    expect(resolved?.primary).toBe('#23334e');
    expect(resolved?.accent).toBe('#c9a24d');
    const framed = buildFramedSvg(QR_SVG, { frame: { id: 'simple', color: '"><script>x', accentColor: 'red' }, plateColor: 'javascript:1' })!;
    expect(framed.svg).not.toContain('<script');
    expect(framed.svg).not.toContain('javascript');
    parse(framed.svg);
  });

  it('mixes colours and picks readable text', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(readableOn('#ffffff')).not.toBe('#ffffff');
    expect(readableOn('#000000')).toBe('#ffffff');
  });

  it('uses the code background as the plate only when it is plain and opaque', () => {
    expect(plateColorFor({ backgroundColor: '#faf9f6' })).toBe('#faf9f6');
    expect(plateColorFor({ backgroundColor: '#faf9f6', backgroundOpacity: 50 })).toBe('#ffffff');
    expect(plateColorFor({ backgroundColor: '#faf9f6', backgroundGradient: {} })).toBe('#ffffff');
    expect(plateColorFor({})).toBe('#ffffff');
  });
});

describe('placing the code', () => {
  it('prefixes ids so several framed codes can share a page', () => {
    const out = prefixIds(QR_SVG, 'p1');
    expect(out).toContain('id="p1-clip-a"');
    expect(out).toContain('url(#p1-clip-a)');
    // qr-code-styling writes its references quoted.
    expect(prefixIds(`<g clip-path="url('#clip-a')"/><g clip-path='url("#b")'/>`, 'p2')).toBe(
      `<g clip-path="url('#p2-clip-a')"/><g clip-path='url("#p2-b")'/>`,
    );
  });

  it('returns null for no frame or an unknown one', () => {
    expect(buildFramedSvg(QR_SVG, { frame: undefined })).toBeNull();
    expect(buildFramedSvg(QR_SVG, { frame: { id: 'bogus' } })).toBeNull();
  });

  it('rejects something that is not SVG', () => {
    expect(() => buildFramedSvg('<p>no</p>', { frame: { id: 'simple' } })).toThrow();
  });

  it('reads the module count from a real code', () => {
    const qr = createQRCode({ data: 'https://example.com', width: 200, height: 200, type: 'svg', errorCorrectionLevel: 'H' });
    expect(qrModuleCount(qr)).toBeGreaterThanOrEqual(21);
  });
});

describe('frame config', () => {
  it('builds a default config for each design', () => {
    for (const id of FRAME_IDS) {
      const config = defaultFrameConfig(id);
      expect(config.id).toBe(id);
      expect(resolveFrame(config)?.caption).toBe(config.caption);
    }
  });

  it('is accepted by the save schema (style is only size-checked)', () => {
    const parsed = CreateQRSchema.safeParse({
      name: 'x',
      qrType: 'text',
      payload: 'hello',
      styleConfig: { dotStyle: 'rounded', frame: defaultFrameConfig('wedding') },
    });
    expect(parsed.success).toBe(true);
  });
});

describe('frame design checks', () => {
  const base = { data: 'https://x.co', backgroundColor: '#FFFFFF', dotColor: '#000000' };

  it('has no frame issues for a normal framed code', () => {
    expect(checkDesign({ ...base, frame: defaultFrameConfig('simple') })).toEqual([]);
  });

  it('accepts a caption of up to 24 characters without comment', () => {
    expect(checkDesign({ ...base, frame: { id: 'simple', caption: 'x'.repeat(24) } })).toEqual([]);
  });

  it('warns, without cutting it, when a caption is long enough that its text gets small', () => {
    for (const length of [25, 40, 50]) {
      const issues = checkDesign({ ...base, frame: { id: 'simple', caption: 'x'.repeat(length) } });
      expect(issues.some((i) => i.text.includes('caption is long'))).toBe(true);
      expect(issues.some((i) => i.text.includes('cut short'))).toBe(false);
      expect(issues.every((i) => i.severity === 'warning')).toBe(true);
    }
  });

  it('warns that a caption over 50 characters is cut short', () => {
    const issues = checkDesign({ ...base, frame: { id: 'simple', caption: 'x'.repeat(60) } });
    expect(issues.some((i) => i.text.includes('cut short'))).toBe(true);
  });

  it('warns when the frame colour matches the code background', () => {
    const issues = checkDesign({ ...base, frame: { id: 'simple', color: '#fefefe' } });
    expect(issues.some((i) => i.text.includes('almost the same'))).toBe(true);
  });

  it('warns about a frame on a see-through background', () => {
    const issues = checkDesign({ ...base, backgroundOpacity: 40, frame: defaultFrameConfig('simple') });
    expect(issues.some((i) => i.text.includes('see-through code background'))).toBe(true);
  });

  it('ignores an unknown frame', () => {
    // @ts-expect-error an old or hand-edited id
    expect(checkDesign({ ...base, frame: { id: 'gone' } })).toEqual([]);
  });
});
