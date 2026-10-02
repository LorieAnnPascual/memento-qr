import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { test, expect, request as playwrightRequest, type APIRequestContext, type Page } from '@playwright/test';

import { createPage, deletePage, qaName } from './helpers/api';
import { EMPTY_STATE } from './helpers/users';

const MB = 1024 * 1024;

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

/** An MP4-looking file of any size: right header, zero filler. Enough for upload and size checks. */
function fakeMp4(bytes: number): Buffer {
  const buffer = Buffer.alloc(bytes);
  Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]).copy(buffer);
  return buffer;
}

interface LibraryFile {
  id: string;
  fileName: string;
  mimeType: string;
  publicUrl: string;
}

async function listMedia(request: APIRequestContext): Promise<LibraryFile[]> {
  return ((await (await request.get('/api/upload')).json()) as { files: LibraryFile[] }).files;
}

/** Uploads through the real Media page and returns the stored file. */
async function uploadThroughUi(page: Page, request: APIRequestContext, name: string, buffer: Buffer, type: string) {
  await page.goto('/media');
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: type, buffer });
  await expect(page.getByText('Video uploaded')).toBeVisible({ timeout: 30_000 });
  const file = (await listMedia(request)).find((item) => item.fileName === name);
  if (!file) throw new Error('uploaded video is not in the library');
  return file;
}

test.describe('Video uploads', () => {
  test('a real video uploads, plays from storage, and deleting it removes the file', async ({ page, request }) => {
    const name = `${qaName('clip')}.webm`;
    const webm = await makeWebm(page);
    await page.goto('/media');
    await page.locator('input[type="file"]').setInputFiles({ name, mimeType: 'video/webm', buffer: webm });

    await expect(page.getByText('Video uploaded')).toBeVisible({ timeout: 30_000 });
    const card = page.getByLabel(name, { exact: true });
    await expect(card).toBeVisible();
    await expect(page.getByText(/Video · /).first()).toBeVisible();

    // The browser can fetch it from storage and read it (metadata loaded).
    await expect.poll(() => card.evaluate((video: HTMLVideoElement) => video.readyState), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);

    const stored = (await listMedia(request)).find((item) => item.fileName === name)!;
    expect(stored.mimeType).toBe('video/webm');
    expect((await request.get(stored.publicUrl)).status()).toBe(200);

    // The storage URL is permanent and reachable by anyone who has it, which is how pages play it.
    const anonymous = await playwrightRequest.newContext({ storageState: EMPTY_STATE });
    expect((await anonymous.get(stored.publicUrl, { headers: { Range: 'bytes=0-15' } })).status()).toBeLessThan(300);
    await anonymous.dispose();

    // Delete through the UI: asks first, then removes the record and the stored file.
    await page.getByRole('button', { name: `Delete ${name}` }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Media deleted')).toBeVisible();
    expect((await listMedia(request)).some((item) => item.id === stored.id)).toBe(false);
    // (A fresh query string skips the CDN's copy, which can outlive a delete for up to an hour.)
    expect((await request.get(`${stored.publicUrl}?fresh=${Date.now()}`)).status()).not.toBe(200);
  });

  test('a file over the old 1 MB bucket limit uploads fine', async ({ page, request }) => {
    const name = `${qaName('big')}.mp4`;
    const file = await uploadThroughUi(page, request, name, fakeMp4(3 * MB), 'video/mp4');

    try {
      expect(file.mimeType).toBe('video/mp4');
      expect((await listMedia(request)).find((item) => item.id === file.id)).toBeTruthy();
    } finally {
      await request.delete(`/api/upload/${file.id}`);
    }
  });

  test('a file that only pretends to be a video is refused and nothing is kept', async ({ page, request }) => {
    const name = `${qaName('fake')}.mp4`;
    await page.goto('/media');
    await page.locator('input[type="file"]').setInputFiles({
      name,
      mimeType: 'video/mp4',
      buffer: Buffer.from('<!DOCTYPE html><script>alert(1)</script>'),
    });

    await expect(page.getByText('That file is not a valid video')).toBeVisible({ timeout: 30_000 });
    expect((await listMedia(request)).some((item) => item.fileName === name)).toBe(false);
    await expect(page.getByLabel(name, { exact: true })).toHaveCount(0);
  });

  test('a video over the size limit is stopped before anything is uploaded', async ({ page }) => {
    const signed: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/upload/video')) signed.push(req.url());
    });
    await page.goto('/media');
    // Playwright will not pass a buffer over 50 MB, so this one goes through a real file.
    const folder = mkdtempSync(join(tmpdir(), 'memento-video-'));
    const huge = join(folder, 'huge.mp4');
    writeFileSync(huge, fakeMp4(51 * MB));
    try {
      await page.locator('input[type="file"]').setInputFiles(huge);

      await expect(page.getByText(/The limit is 50\.0 MB/)).toBeVisible();
      expect(signed).toHaveLength(0);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  test('other file types are not accepted as videos', async ({ page }) => {
    await page.goto('/media');
    await page.locator('input[type="file"]').setInputFiles({ name: 'movie.avi', mimeType: 'video/x-msvideo', buffer: Buffer.from('RIFF....AVI ') });

    // Not a video, so it takes the image route, which refuses it.
    await expect(page.getByText(/Failed to upload image|valid image|Unsupported/i).first()).toBeVisible();
  });

  test('the video upload endpoints need a login', async ({ baseURL }) => {
    const anonymous = await playwrightRequest.newContext({ baseURL, storageState: EMPTY_STATE });
    try {
      for (const path of ['/api/upload/video/sign', '/api/upload/video/complete']) {
        const response = await anonymous.post(path, { data: { fileName: 'a.mp4', size: 10, type: 'video/mp4' } });
        expect(response.status()).toBe(401);
      }
    } finally {
      await anonymous.dispose();
    }
  });

  test('image pickers never offer videos', async ({ page, request }) => {
    const video = await uploadThroughUi(page, request, `${qaName('only-video')}.mp4`, fakeMp4(2 * MB), 'video/mp4');
    try {
      await page.goto('/qr/new');
      await page.getByRole('tab', { name: 'Style' }).click();
      await page.getByRole('button', { name: /choose from media/i }).first().click();
      await expect(page.getByRole('dialog').getByText('Choose from media')).toBeVisible();
      await expect(page.getByRole('dialog').getByText(video.fileName)).toHaveCount(0);
    } finally {
      await request.delete(`/api/upload/${video.id}`);
    }
  });

  test('a published page plays an uploaded video from our storage', async ({ page, request, baseURL, browser }) => {
    const webm = await makeWebm(page);
    const video = await uploadThroughUi(page, request, `${qaName('page-clip')}.webm`, webm, 'video/webm');
    const created = await createPage(request, {
      name: qaName('video-page'),
      puckData: {
        root: { props: {} },
        content: [{ type: 'VideoEmbed', props: { id: 'v1', file: video.publicUrl, url: '', posterUrl: '' } }],
        zones: {},
      },
    });
    try {
      const publish = await request.post(`/api/pages/${created.id}/publish`, { data: { expiresAt: null } });
      expect(publish.status()).toBe(200);
      const { shortCode } = (await (await request.get(`/api/pages/${created.id}`)).json()) as { shortCode: string };

      // A visitor with no login gets a real <video>, and the policy lets it load from storage only.
      const anonymous = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
      const visitor = await anonymous.newPage();
      const response = await visitor.goto(`/p/${shortCode}`);
      const csp = response!.headers()['content-security-policy'];
      expect(csp).toMatch(/media-src 'self' https:\/\/[^ ;]+\.supabase\.co/);
      expect(csp).not.toMatch(/media-src[^;]*\*/);

      const player = visitor.locator('video');
      await expect(player).toHaveAttribute('src', video.publicUrl);
      await expect(player).toHaveAttribute('controls', '');
      await expect.poll(() => player.evaluate((el: HTMLVideoElement) => el.readyState), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
      await anonymous.close();
    } finally {
      await deletePage(request, created.id);
      await request.delete(`/api/upload/${video.id}`);
    }
  });

  test('a page cannot play a "video" from another site', async ({ request, baseURL }) => {
    const created = await createPage(request, {
      name: qaName('video-evil'),
      puckData: {
        root: { props: {} },
        content: [{ type: 'VideoEmbed', props: { id: 'v1', file: 'https://evil.example/storage/v1/object/public/uploads/a/b.mp4', url: '', posterUrl: '' } }],
        zones: {},
      },
    });
    try {
      await request.post(`/api/pages/${created.id}/publish`, { data: { expiresAt: null } });
      const { shortCode } = (await (await request.get(`/api/pages/${created.id}`)).json()) as { shortCode: string };
      const anonymous = await playwrightRequest.newContext({ baseURL, storageState: EMPTY_STATE });
      const html = await (await anonymous.get(`/p/${shortCode}`)).text();
      await anonymous.dispose();

      expect(html).not.toContain('<video');
      expect(html).not.toContain('evil.example');
    } finally {
      await deletePage(request, created.id);
    }
  });

  test('the page editor can choose an uploaded video from the media library and saves it', async ({ page, request }) => {
    const webm = await makeWebm(page);
    const video = await uploadThroughUi(page, request, `${qaName('editor-clip')}.webm`, webm, 'video/webm');
    const created = await createPage(request, {
      name: qaName('video-editor'),
      puckData: { root: { props: {} }, content: [{ type: 'VideoEmbed', props: { id: 'v1', file: '', url: '', posterUrl: '' } }], zones: {} },
    });
    try {
      await page.goto(`/pages/${created.id}`);
      await page.frameLocator('iframe#preview-frame').getByText('Upload a video, or add a YouTube or Vimeo link.').click();

      await expect(page.getByRole('button', { name: 'Upload video', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'From media' }).first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Pick a video you have already uploaded.')).toBeVisible();
      await dialog.getByText(video.fileName).click();

      await expect(page.frameLocator('iframe#preview-frame').locator('video')).toHaveAttribute('src', video.publicUrl);

      await page.getByRole('button', { name: 'Save', exact: true }).first().click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Page saved')).toBeVisible();

      const saved = (await (await request.get(`/api/pages/${created.id}`)).json()) as { puckData: { content: { props: { file: string } }[] } };
      expect(saved.puckData.content[0].props.file).toBe(video.publicUrl);
    } finally {
      await deletePage(request, created.id);
      await request.delete(`/api/upload/${video.id}`);
    }
  });

  test('deleting a video from media clears it from pages that use it', async ({ page, request }) => {
    const webm = await makeWebm(page);
    const video = await uploadThroughUi(page, request, `${qaName('used-clip')}.webm`, webm, 'video/webm');
    const created = await createPage(request, {
      name: qaName('video-cleared'),
      puckData: { root: { props: {} }, content: [{ type: 'VideoEmbed', props: { id: 'v1', file: video.publicUrl, url: '', posterUrl: '' } }], zones: {} },
    });
    try {
      expect((await request.delete(`/api/upload/${video.id}`)).status()).toBe(204);

      const after = (await (await request.get(`/api/pages/${created.id}`)).json()) as { puckData: { content: { props: { file: string } }[] } };
      expect(after.puckData.content[0].props.file).toBe('');
    } finally {
      await deletePage(request, created.id);
    }
  });
});
