import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { buildPreviewHtml, downloadPageHtml } from '@/lib/pages/download-html';
import { PUBLIC_PAGE_CSP, STANDALONE_PAGE_CSP } from '@/lib/pages/csp';
import { SYSTEM_PAGE_TEMPLATES } from '@/lib/pages/templates';

const DATA = SYSTEM_PAGE_TEMPLATES[0].puckData;

describe('buildPreviewHtml', () => {
  it('bakes a no-scripts CSP into the document', async () => {
    const html = await buildPreviewHtml('Memorial', DATA);

    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('In Loving Memory');
  });
});

describe('downloadPageHtml', () => {
  const clickMock = vi.fn();
  let capturedBlob: Blob | undefined;
  let capturedName = '';

  beforeEach(() => {
    clickMock.mockReset();
    capturedBlob = undefined;
    capturedName = '';
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (blob: Blob) => {
        capturedBlob = blob;
        return 'blob:test';
      },
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      capturedName = this.download;
      clickMock();
    });
  });

  it('downloads a slug-named standalone .html file', async () => {
    await downloadPageHtml('Memorial Page!', DATA);

    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(capturedName).toBe('memorial-page.html');
    expect(capturedBlob?.type).toBe('text/html;charset=utf-8');
    expect(await capturedBlob?.text()).toContain('<!DOCTYPE html>');
  });
});

describe('page CSPs', () => {
  it('locks down objects, forms and unknown frame hosts on the live page', () => {
    expect(PUBLIC_PAGE_CSP).toContain("object-src 'none'");
    expect(PUBLIC_PAGE_CSP).toContain("form-action 'none'");
    expect(PUBLIC_PAGE_CSP).toContain('frame-src https://www.youtube.com');
    expect(PUBLIC_PAGE_CSP).not.toMatch(/frame-src[^;]*\*/);
  });

  it('allows no scripts at all in standalone previews', () => {
    expect(STANDALONE_PAGE_CSP).toContain("default-src 'none'");
    expect(STANDALONE_PAGE_CSP).not.toContain('script-src');
  });
});

describe('page CSPs and uploaded videos', () => {
  beforeEach(() => {
    vi.unstubAllGlobals(); // earlier tests in this file replace the global URL
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('lets pages play videos from our own storage and nowhere else', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co/');
    vi.resetModules();
    const csp = await import('@/lib/pages/csp');

    expect(csp.PUBLIC_PAGE_CSP).toContain("media-src 'self' https://proj.supabase.co");
    expect(csp.PUBLIC_PAGE_CSP).not.toMatch(/media-src[^;]*\*/);
    expect(csp.STANDALONE_PAGE_CSP).toContain('media-src https://proj.supabase.co');
  });

  it('allows no outside media when the storage address is unknown', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.resetModules();
    const csp = await import('@/lib/pages/csp');

    expect(csp.PUBLIC_PAGE_CSP).toContain("media-src 'self'");
    expect(csp.STANDALONE_PAGE_CSP).toContain("media-src 'none'");
  });

  it('lets a downloaded page play videos addressed on our own domain too', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://memento-qr.vercel.app/');
    vi.resetModules();
    const csp = await import('@/lib/pages/csp');

    expect(csp.STANDALONE_PAGE_CSP).toContain('media-src https://proj.supabase.co https://memento-qr.vercel.app;');
  });
});
