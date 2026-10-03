import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const executeMock = vi.fn();

vi.mock('@/lib/db', () => ({ db: { execute: executeMock } }));

/** Flattens a drizzle `sql` object into its text and bound values. */
function flatten(query: unknown): { text: string; values: unknown[] } {
  let text = '';
  const values: unknown[] = [];
  const walk = (node: unknown): void => {
    if (node && typeof node === 'object' && 'queryChunks' in node) {
      for (const chunk of (node as { queryChunks: unknown[] }).queryChunks) walk(chunk);
    } else if (node && typeof node === 'object' && 'value' in node && Array.isArray((node as { value: unknown }).value)) {
      text += ((node as { value: string[] }).value).join('');
    } else {
      values.push(node);
      text += '?';
    }
  };
  walk(query);
  return { text, values };
}

describe('clearMediaReferences', () => {
  beforeEach(() => {
    executeMock.mockReset();
    executeMock.mockResolvedValue(undefined);
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://memento-qr.vercel.app');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('neutralises video QR codes that use the deleted video', async () => {
    const { clearMediaReferences } = await import('@/lib/qr/clear-media-references');
    const url = 'https://memento-qr.vercel.app/media/abc/def.mp4';

    await clearMediaReferences(url);

    const statements = executeMock.mock.calls.map(([query]) => flatten(query));
    const video = statements.find((s) => s.text.includes("qr_type = 'video'"));
    expect(video).toBeDefined();
    expect(video!.text).toContain('target_url = NULL');
    expect(video!.text).toContain("payload_fields - 'videoUrl'");
    expect(video!.values).toContain(url);
  });

  it('also matches the older storage address of the same file', async () => {
    const { clearMediaReferences } = await import('@/lib/qr/clear-media-references');
    const legacy = 'https://proj.supabase.co/storage/v1/object/public/uploads/abc/def.mp4';

    await clearMediaReferences(legacy);

    const video = executeMock.mock.calls.map(([query]) => flatten(query)).find((s) => s.text.includes("qr_type = 'video'"));
    expect(video!.values).toEqual(expect.arrayContaining([legacy, 'https://memento-qr.vercel.app/media/abc/def.mp4']));
  });

  it('still clears images from QR styles and pages', async () => {
    const { clearMediaReferences } = await import('@/lib/qr/clear-media-references');

    await clearMediaReferences('https://proj.supabase.co/storage/v1/object/public/uploads/abc/logo.png');

    const texts = executeMock.mock.calls.map(([query]) => flatten(query).text).join('\n');
    expect(texts).toContain("style_config - 'logoUrl'");
    expect(texts).toContain('UPDATE page_templates');
  });
});
