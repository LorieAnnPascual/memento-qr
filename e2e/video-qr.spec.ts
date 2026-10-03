import { test, expect, request as playwrightRequest, type APIRequestContext, type Page } from '@playwright/test';

import { createPage, createQR, deletePage, deleteQR, qaName } from './helpers/api';
import { EMPTY_STATE } from './helpers/users';

/** A name nobody has used before (links are unique across the whole database). */
function freshSlug(label: string): string {
  return `qa-${label}-${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 2).toString(36)}`.slice(0, 30);
}

/** Records a short, genuinely playable WebM in the browser (no video tools needed on this machine). */
async function makeWebm(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext('2d')!;
    const recorder = new MediaRecorder(canvas.captureStream(15), { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
    recorder.start();
    for (let frame = 0; frame < 20; frame += 1) {
      context.fillStyle = `hsl(${frame * 18}, 70%, 50%)`;
      context.fillRect(0, 0, 160, 90);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    recorder.stop();
    await stopped;
    const bytes = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
    let binary = '';
    bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
    return btoa(binary);
  });
  return Buffer.from(base64, 'base64');
}

interface LibraryFile {
  id: string;
  fileName: string;
  storagePath: string;
  publicUrl: string;
}

async function listMedia(request: APIRequestContext): Promise<LibraryFile[]> {
  return ((await (await request.get('/api/upload')).json()) as { files: LibraryFile[] }).files;
}

/** Uploads a real video through the Media page. */
async function uploadVideo(page: Page, request: APIRequestContext, name: string): Promise<LibraryFile> {
  await page.goto('/media');
  const buffer = await makeWebm(page);
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: 'video/webm', buffer });
  await expect(page.getByText('Video uploaded')).toBeVisible({ timeout: 30_000 });
  const file = (await listMedia(request)).find((item) => item.fileName === name);
  if (!file) throw new Error('uploaded video is not in the library');
  return file;
}

/** A visitor with no session, like someone scanning a printed code. */
async function visitor(baseURL: string | undefined) {
  return playwrightRequest.newContext({ baseURL, storageState: EMPTY_STATE });
}

async function scan(baseURL: string | undefined, code: string) {
  const anon = await visitor(baseURL);
  try {
    const response = await anon.get(`/q/${code}`, { maxRedirects: 0 });
    return { status: response.status(), headers: response.headers(), body: await response.text() };
  } finally {
    await anon.dispose();
  }
}

function playerSrc(html: string): string {
  const match = /<video[^>]*\ssrc="([^"]+)"/.exec(html);
  if (!match) throw new Error('no <video src> in the page');
  return match[1];
}

async function saveQr(page: Page, label: 'Save QR code' | 'Save changes'): Promise<void> {
  await page.getByRole('button', { name: label }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: label }).click();
}

test.describe('Video QR codes', () => {
  test('upload in the designer, scan plays it on the same link from our own domain, rename, pause, delete', async ({
    page,
    request,
    baseURL,
    browser,
  }) => {
    const slug = freshSlug('clip');
    const renamed = freshSlug('clip2');
    const fileName = `${qaName('designer-clip')}.webm`;
    const codeName = qaName('video-code');
    let qrId: string | null = null;

    await page.goto('/qr/new');
    const webm = await makeWebm(page);

    try {
      await page.getByTestId('qr-type-video').click();

      // Always dynamic: the switch is on and cannot be turned off, and says why.
      await page.getByRole('tab', { name: 'Dynamic QR' }).click();
      const toggle = page.getByRole('switch', { name: 'Make this dynamic' });
      await expect(toggle).toBeChecked();
      await expect(toggle).toBeDisabled();
      await expect(page.getByText('Video codes are always dynamic so the video can be replaced without reprinting.')).toBeVisible();
      await page.getByRole('tab', { name: 'Content' }).click();

      // Upload with the form's own button; preview, name and size show up.
      await page.getByLabel('Name', { exact: true }).fill(codeName);
      await page.getByTestId('video-file-input').setInputFiles({ name: fileName, mimeType: 'video/webm', buffer: webm });
      await expect(page.getByText('Video uploaded')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('video-file-meta')).toContainText(fileName);
      await expect(page.getByTestId('video-file-meta')).toContainText(/KB|MB/);
      await expect
        .poll(() => page.getByTestId('video-selected').locator('video').evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 20_000 })
        .toBeGreaterThanOrEqual(1);

      // The link name sits right under the video, once.
      const slugField = page.getByLabel('Custom link name (optional)');
      await expect(slugField).toHaveCount(1);
      await slugField.fill(slug);
      await expect(page.getByText('Available', { exact: true })).toBeVisible();

      await saveQr(page, 'Save QR code');
      await expect(page).toHaveURL(/\/qr\/[0-9a-f-]{36}$/);
      qrId = page.url().split('/').pop()!;

      const saved = (await (await request.get(`/api/qr/${qrId}`)).json()) as {
        qrType: string;
        isDynamic: boolean;
        shortCode: string;
        targetUrl: string;
        payload: string;
        payloadFields: { videoUrl: string; fileName: string; fileSize: number };
      };
      const appOrigin = new URL(baseURL!).origin;
      expect(saved).toMatchObject({ qrType: 'video', isDynamic: true, shortCode: slug });
      expect(saved.payload).toBe(`${appOrigin}/q/${slug}`);
      expect(saved.targetUrl.startsWith(`${appOrigin}/media/`)).toBe(true);
      expect(saved.targetUrl).not.toContain('supabase.co');
      expect(saved.payloadFields).toMatchObject({ videoUrl: saved.targetUrl, fileName });

      // --- a stranger scanning it: HTML player on the same address, no redirect
      const first = await scan(baseURL, slug);
      expect(first.status).toBe(200);
      expect(first.headers['content-type']).toContain('text/html');
      expect(first.headers['content-security-policy']).toContain("default-src 'none'");
      expect(first.body).toContain('<video');
      expect(first.body).toContain(`<title>${codeName}</title>`);
      const src = playerSrc(first.body);
      expect(src.startsWith(`${appOrigin}/media/`)).toBe(true);
      expect(first.body).not.toContain('supabase.co');

      // The media address streams to anyone and supports seeking.
      const anon = await visitor(baseURL);
      const ranged = await anon.get(src, { headers: { Range: 'bytes=0-99' } });
      expect([200, 206]).toContain(ranged.status());
      expect(ranged.headers()['content-type']).toMatch(/^video\//);
      if (ranged.status() === 206) {
        expect(ranged.headers()['content-range']).toMatch(/^bytes 0-99\//);
        expect((await ranged.body()).length).toBe(100);
      }
      const whole = await anon.get(src);
      expect(whole.status()).toBe(200);
      expect(whole.headers()['content-type']).toMatch(/^video\//);
      await anon.dispose();

      // A real browser loads the video (metadata read) from that page.
      const context = await browser.newContext({ baseURL, storageState: EMPTY_STATE });
      const watcher = await context.newPage();
      await watcher.goto(`/q/${slug}`);
      await expect
        .poll(() => watcher.locator('video').evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 20_000 })
        .toBeGreaterThanOrEqual(1);
      await context.close();

      // Scans are counted once per page load (never for the /media/ requests above).
      await expect
        .poll(async () => ((await (await request.get(`/api/qr/${qrId}`)).json()) as { scanCount: number }).scanCount, { timeout: 15_000 })
        .toBe(2); // the one scan above and the browser's page load; the /media/ requests count for nothing

      // --- rename: the old printed link still plays it
      const renameResponse = await request.put(`/api/qr/${qrId}`, { data: { slug: renamed } });
      expect(renameResponse.status()).toBe(200);
      const viaNew = await scan(baseURL, renamed);
      const viaOld = await scan(baseURL, slug);
      expect(viaNew.status).toBe(200);
      expect(viaOld.status).toBe(200);
      expect(playerSrc(viaOld.body)).toBe(playerSrc(viaNew.body));

      // --- pause: still gated, on both links
      await request.put(`/api/qr/${qrId}`, { data: { isPaused: true } });
      for (const code of [renamed, slug]) {
        const paused = await scan(baseURL, code);
        expect(paused.status).toBe(410);
        expect(paused.body).toContain('Paused');
        expect(paused.body).not.toContain('<video');
      }
      await request.put(`/api/qr/${qrId}`, { data: { isPaused: false } });
      expect((await scan(baseURL, slug)).status).toBe(200);

      // --- it cannot be made static
      const toStatic = await request.put(`/api/qr/${qrId}`, { data: { isDynamic: false } });
      expect(toStatic.status()).toBe(400);
      expect((await toStatic.json()).code).toBe('VIDEO_MUST_BE_DYNAMIC');
      const stillDynamic = (await (await request.get(`/api/qr/${qrId}`)).json()) as { isDynamic: boolean; shortCode: string };
      expect(stillDynamic).toMatchObject({ isDynamic: true, shortCode: renamed });

      const createStatic = await request.post('/api/qr', {
        data: {
          name: qaName('static-video'),
          qrType: 'video',
          payload: `${new URL(baseURL!).origin}/media/a/b.webm`,
          styleConfig: {},
          isDynamic: false,
        },
      });
      expect(createStatic.status()).toBe(400);
      expect((await createStatic.json()).code).toBe('VIDEO_MUST_BE_DYNAMIC');

      // --- deleting the video from Media switches the code off cleanly (404, not an error)
      const file = (await listMedia(request)).find((item) => item.fileName === fileName)!;
      expect(file).toBeTruthy();
      expect((await request.delete(`/api/upload/${file.id}`)).status()).toBe(204);

      const gone = await scan(baseURL, slug);
      expect(gone.status).toBe(404);
      expect(gone.body).not.toContain('<video');
      const cleared = (await (await request.get(`/api/qr/${qrId}`)).json()) as {
        targetUrl: string | null;
        payloadFields: { videoUrl?: string };
      };
      expect(cleared.targetUrl).toBeNull();
      expect(cleared.payloadFields.videoUrl).toBeUndefined();
    } finally {
      if (qrId) await deleteQR(request, qrId);
      const leftover = (await listMedia(request)).find((item) => item.fileName === fileName);
      if (leftover) await request.delete(`/api/upload/${leftover.id}`);
    }
  });

  test('a video from the Media library can be picked, and an older Supabase address still plays through our domain', async ({
    page,
    request,
    baseURL,
  }) => {
    const fileName = `${qaName('picked-clip')}.webm`;
    const file = await uploadVideo(page, request, fileName);
    const storageOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
    const legacyUrl = `${storageOrigin}/storage/v1/object/public/uploads/${file.storagePath}`;
    let qrId: string | null = null;
    let pageId: string | null = null;
    let legacyQrId: string | null = null;

    try {
      // New uploads are addressed on our own domain.
      expect(file.publicUrl).toBe(`${new URL(baseURL!).origin}/media/${file.storagePath}`);

      // Pick it from the library in the designer.
      await page.goto('/qr/new');
      await page.getByTestId('qr-type-video').click();
      await page.getByRole('button', { name: 'From media' }).click();
      await page.getByRole('dialog').getByText(fileName).click();
      await expect(page.getByTestId('video-file-meta')).toContainText(fileName);
      await page.getByLabel('Name', { exact: true }).fill(qaName('picked-code'));
      await saveQr(page, 'Save QR code');
      await expect(page).toHaveURL(/\/qr\/[0-9a-f-]{36}$/);
      qrId = page.url().split('/').pop()!;
      const saved = (await (await request.get(`/api/qr/${qrId}`)).json()) as { shortCode: string; targetUrl: string };
      expect(saved.targetUrl).toBe(file.publicUrl);
      const scanned = await scan(baseURL, saved.shortCode);
      expect(scanned.status).toBe(200);
      expect(playerSrc(scanned.body)).toBe(file.publicUrl);

      // A code made with the older storage address still plays, through /media/, never exposing supabase.co.
      const legacy = await createQR(request, {
        name: qaName('legacy-video'),
        qrType: 'video',
        payload: legacyUrl,
        isDynamic: true,
      });
      legacyQrId = legacy.id;
      const legacyScan = await scan(baseURL, legacy.shortCode!);
      expect(legacyScan.status).toBe(200);
      expect(playerSrc(legacyScan.body)).toBe(file.publicUrl);
      expect(legacyScan.body).not.toContain('supabase.co');

      // A video that is not one of ours is refused when the code is saved, created or edited
      // (the scan itself also refuses it, covered by the unit tests).
      for (const bad of ['https://evil.example/media/a/b.mp4', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ']) {
        const create = await request.post('/api/qr', {
          data: { name: qaName('evil-video'), qrType: 'video', payload: bad, styleConfig: {}, isDynamic: true },
        });
        expect(create.status()).toBe(400);
        expect((await create.json()).code).toBe('INVALID_VIDEO');
      }
      const edit = await request.put(`/api/qr/${qrId}`, { data: { payload: 'https://evil.example/media/a/b.mp4' } });
      expect(edit.status()).toBe(400);
      expect((await edit.json()).code).toBe('INVALID_VIDEO');
      expect(playerSrc((await scan(baseURL, saved.shortCode)).body)).toBe(file.publicUrl); // unchanged

      // An older Supabase address is still accepted by a page's video block.
      const created = await createPage(request, {
        name: qaName('legacy-page'),
        puckData: {
          root: { props: {} },
          content: [{ type: 'VideoEmbed', props: { id: 'v1', file: legacyUrl, url: '', posterUrl: '' } }],
          zones: {},
        },
      });
      pageId = created.id;
      expect((await request.post(`/api/pages/${pageId}/publish`, { data: { expiresAt: null } })).status()).toBe(200);
      const { shortCode } = (await (await request.get(`/api/pages/${pageId}`)).json()) as { shortCode: string };
      const anon = await visitor(baseURL);
      const html = await (await anon.get(`/p/${shortCode}`)).text();
      await anon.dispose();
      expect(html).toContain('<video');
      expect(html).toContain(legacyUrl);
    } finally {
      if (pageId) await deletePage(request, pageId);
      if (legacyQrId) await deleteQR(request, legacyQrId);
      if (qrId) await deleteQR(request, qrId);
      await request.delete(`/api/upload/${file.id}`);
    }
  });

  test('/media/ serves video files only, to anyone, and a missing file is not a success', async ({ baseURL }) => {
    const anon = await visitor(baseURL);
    try {
      const png = await anon.get('/media/abc/def.png');
      expect(png.status()).toBe(404);

      const missing = await anon.get('/media/11111111-2222-3333-4444-555555555555/nothing-here-xyz.mp4');
      expect(missing.status()).toBeGreaterThanOrEqual(400);
      expect(await missing.text()).not.toContain('supabase.co');

      // Not the other buckets or folders either.
      expect((await anon.get('/media/a/b/c.mp4')).status()).toBe(404);
      expect((await anon.get('/media/..%2f..%2fprivate/x.mp4')).status()).toBe(404);
    } finally {
      await anon.dispose();
    }
  });
});
