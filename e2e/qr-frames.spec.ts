import { mkdirSync, readFileSync, statSync } from 'node:fs';

import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

import { createQR, deleteQR, qaName } from './helpers/api';

/** Keep in step with src/lib/qr/frames/registry.ts. */
const FRAMES = [
  { id: 'simple', caption: 'Scan me' },
  { id: 'business', caption: 'Scan me' },
  { id: 'wedding', caption: 'Scan for our story' },
  { id: 'birthday', caption: 'Happy Birthday!' },
  { id: 'graduation', caption: 'Congratulations!' },
  { id: 'baby', caption: 'Welcome little one' },
  { id: 'memorial', caption: 'In loving memory' },
  { id: 'pets', caption: 'Meet our pet' },
] as const;

const preview = (page: Page) => page.getByTestId('qr-preview-canvas');
const framedPreview = (page: Page, id: string) => preview(page).locator(`svg[data-frame="${id}"]`);
const styleTab = (page: Page) => page.getByRole('tab', { name: 'Style' });

/** The style a new code gets (the Memento logo in the middle, strongest error correction), plus a frame. */
function styleWithFrame(frame?: Record<string, unknown>): Record<string, unknown> {
  return {
    dotStyle: 'rounded',
    dotColor: '#000000',
    cornerSquareStyle: 'extra-rounded',
    cornerDotStyle: 'dot',
    backgroundColor: '#FFFFFF',
    logoUrl: '/memento-qr-logo.png',
    logoSize: 0.3,
    logoMargin: 4,
    errorCorrectionLevel: 'H',
    cardLayout: 'none',
    ...(frame ? { frame } : {}),
  };
}

async function openDesigner(page: Page): Promise<void> {
  await page.goto('/qr/new');
  await page.getByRole('textbox', { name: 'Website URL' }).fill('example.com');
  await expect(preview(page).locator('svg').first()).toBeVisible();
}

async function pickFrame(page: Page, id: string): Promise<void> {
  await styleTab(page).click();
  await page.getByTestId(`qr-frame-${id}`).click();
}

async function downloadAs(page: Page, label: string | RegExp) {
  await page.getByRole('button', { name: 'Download' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: label }).click()]);
  return download;
}

/** The app's own "Is this QR working?" check: renders the code, reads it back like a phone, and gives a verdict. */
async function verdictFor(page: Page, name: string): Promise<{ verdict: string; text: string }> {
  await page.goto('/qr');
  await page.getByPlaceholder('Search by name…').fill(name);
  await page.getByRole('button', { name: `Check that ${name} is working` }).click();
  const dialog = page.getByRole('dialog');
  const headline = dialog.getByText(/Looks good|Needs attention|Not working/).first();
  await expect(headline).toBeVisible({ timeout: 30_000 });
  return { verdict: (await headline.innerText()).trim(), text: await dialog.innerText() };
}

async function createFramed(request: APIRequestContext, label: string, payload: string, frame?: Record<string, unknown>) {
  return createQR(request, { name: qaName(label), qrType: 'text', payload, payloadFields: { text: payload }, styleConfig: styleWithFrame(frame) });
}

const DENSE_TEXT = Array.from({ length: 12 }, (_, i) => `Line ${i + 1}: in loving memory of Ana, always in our hearts.`).join(' ').slice(0, 300);

test.describe('QR frames: designer', () => {
  test('picking frames shows them in the live preview, and None removes them', async ({ page }) => {
    await openDesigner(page);
    await expect(preview(page).locator('svg[data-frame]')).toHaveCount(0);

    for (const { id } of FRAMES.slice(0, 4)) {
      await pickFrame(page, id);
      await expect(framedPreview(page, id)).toBeVisible();
      await expect(page.getByTestId(`qr-frame-${id}`)).toBeVisible();
    }

    await page.getByTestId('qr-frame-none').click();
    await expect(preview(page).locator('svg[data-frame]')).toHaveCount(0);
    await expect(preview(page).locator('svg').first()).toBeVisible();
  });

  test('colour and caption changes show in the preview; clearing the caption removes it', async ({ page }) => {
    await openDesigner(page);
    await pickFrame(page, 'simple');
    const svg = framedPreview(page, 'simple');
    await expect(svg.locator('text')).toHaveText('Scan me');

    await page.getByLabel('Caption', { exact: true }).fill('Ana & Ben <3');
    await expect(svg.locator('text')).toHaveText('Ana & Ben <3');

    await page.getByRole('textbox', { name: 'Frame color (hex code)' }).fill('#aa0000');
    await expect(svg.locator('rect[stroke="#aa0000"]').first()).toBeAttached();

    await page.getByLabel('Caption', { exact: true }).fill('');
    await expect(svg.locator('text')).toHaveCount(0);

    await page.getByRole('button', { name: 'Remove frame' }).click();
    await expect(preview(page).locator('svg[data-frame]')).toHaveCount(0);
    await expect(page.getByTestId('frame-options')).toHaveCount(0);
  });

  test('the picker is a labelled radio group that works from the keyboard', async ({ page }) => {
    await openDesigner(page);
    await styleTab(page).click();
    await expect(page.getByRole('radiogroup', { name: 'Frame' })).toBeVisible();

    await page.getByRole('radio', { name: /none/i }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(preview(page).locator('svg[data-frame]')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Simple' })).toBeChecked();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('radio', { name: 'Business' })).toBeChecked();
    await expect(framedPreview(page, 'business')).toBeVisible();
  });

  test('a card layout with a frame shows the framed code on the card', async ({ page }) => {
    await openDesigner(page);
    await pickFrame(page, 'wedding');
    await page.getByRole('tab', { name: 'Layout' }).click();
    await page.getByTestId('qr-layout-horizontal').click();

    const card = page.getByTestId('qr-preview-card');
    await expect(card.locator('svg[data-frame="wedding"]')).toBeVisible();

    const download = await downloadAs(page, 'PNG');
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    const svgDownload = await downloadAs(page, 'SVG (vector)');
    const svg = readFileSync((await svgDownload.path())!, 'utf8');
    expect(svg).toContain('data-frame="wedding"');
    expect(svg).toContain('Scan for our story');
  });

  test('a template that carries a frame applies it', async ({ page, request }) => {
    const name = qaName('frame tpl');
    const created = await request.post('/api/templates', {
      data: { name, category: 'custom', styleConfig: styleWithFrame({ id: 'pets', color: '#8a5a36', accentColor: '#f2994a', caption: 'Good dog' }) },
    });
    expect(created.ok()).toBeTruthy();
    const { id } = (await created.json()) as { id: string };
    try {
      await openDesigner(page);
      await styleTab(page).click();
      await page.getByRole('button', { name: 'Choose template' }).click();
      await page.getByRole('dialog').getByText(name).click();
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(page.getByRole('radio', { name: 'Pets' })).toBeChecked();
      await expect(framedPreview(page, 'pets').locator('text')).toHaveText('Good dog');
    } finally {
      await request.delete(`/api/templates/${id}`);
    }
  });

  test('has no horizontal scroll at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openDesigner(page);
    await pickFrame(page, 'birthday');
    await expect(framedPreview(page, 'birthday')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('screenshots of every design (for a human to look at)', async ({ page }) => {
    mkdirSync('test-results/frame-shots', { recursive: true });
    await openDesigner(page);
    for (const { id } of FRAMES) {
      await pickFrame(page, id);
      await expect(framedPreview(page, id)).toBeVisible();
      await page.waitForTimeout(300);
      await framedPreview(page, id).screenshot({ path: `test-results/frame-shots/${id}.png` });
    }
    await styleTab(page).click();
    await page.getByTestId('frame-picker').screenshot({ path: 'test-results/frame-shots/picker.png' });
  });
});

test.describe('QR frames: downloads and print', () => {
  test('SVG carries the frame and caption; PNG is larger than the plain code', async ({ page }) => {
    await openDesigner(page);
    const plain = await downloadAs(page, 'PNG');
    const plainSize = statSync((await plain.path())!).size;

    await pickFrame(page, 'wedding');
    await expect(framedPreview(page, 'wedding')).toBeVisible();

    const svgDownload = await downloadAs(page, 'SVG (vector)');
    expect(svgDownload.suggestedFilename()).toMatch(/\.svg$/);
    const svg = readFileSync((await svgDownload.path())!, 'utf8');
    expect(svg).toContain('data-frame="wedding"');
    expect(svg).toContain('Scan for our story');
    expect(svg).toContain('data:image/png;base64'); // the logo travels inside the file
    expect(svg).not.toContain('<script');

    const png = await downloadAs(page, 'PNG');
    expect(png.suggestedFilename()).toMatch(/\.png$/);
    expect(statSync((await png.path())!).size).toBeGreaterThan(plainSize);

    for (const [label, ext] of [
      ['JPEG', 'jpeg'],
      ['WebP', 'webp'],
      [/High-res SVG/, 'svg'],
    ] as const) {
      const download = await downloadAs(page, label);
      expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${ext}$`));
    }
  });

  test('a custom caption is written into the SVG, escaped', async ({ page }) => {
    await openDesigner(page);
    await pickFrame(page, 'simple');
    await page.getByLabel('Caption', { exact: true }).fill('<b>"A" & B</b>');
    const download = await downloadAs(page, 'SVG (vector)');
    const svg = readFileSync((await download.path())!, 'utf8');
    expect(svg).toContain('&lt;b&gt;&quot;A&quot; &amp; B&lt;/b&gt;');
    expect(svg).not.toContain('<b>');
  });

  test('the print PDF dialog works with a frame, and measures the code inside it', async ({ page }) => {
    async function qrMm(): Promise<number> {
      await page.getByRole('button', { name: 'Download' }).click();
      await page.getByRole('menuitem', { name: /Print-ready PDF/ }).click();
      const dialog = page.getByRole('dialog');
      const line = dialog.getByText(/The QR will be about/);
      await expect(line).toBeVisible({ timeout: 30_000 });
      const mm = Number(/about\s+([\d.]+)\s*mm/.exec(await line.innerText())![1]);
      return mm;
    }

    await openDesigner(page);
    const plainMm = await qrMm();
    await page.keyboard.press('Escape');

    await pickFrame(page, 'memorial');
    const framedMm = await qrMm();
    expect(framedMm).toBeLessThan(plainMm);
    expect(framedMm / plainMm).toBeGreaterThan(0.55);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download print PDF' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/-print\.pdf$/);
    expect(readFileSync((await download.path())!).subarray(0, 5).toString()).toBe('%PDF-');
  });
});

test.describe('QR frames: saved codes', () => {
  test('a code saved with a frame reopens with it, can lose it, and survives duplicate', async ({ page, request }) => {
    const created = await createFramed(request, 'framed', 'hello frame', {
      id: 'graduation',
      color: '#123456',
      accentColor: '#abcdef',
      caption: 'Well done',
    });
    let copyId: string | null = null;
    try {
      await page.goto(`/qr/${created.id}`);
      await expect(framedPreview(page, 'graduation').locator('text')).toHaveText('Well done');
      await styleTab(page).click();
      await expect(page.getByRole('radio', { name: 'Graduation' })).toBeChecked();
      await expect(page.getByRole('textbox', { name: 'Frame color (hex code)' })).toHaveValue('#123456');

      // Duplicate keeps the frame.
      await page.goto('/qr');
      await page.getByPlaceholder('Search by name…').fill(created.name);
      await page.getByLabel(`Duplicate ${created.name}`).click();
      await expect(page.getByText(`Duplicated "${created.name}"`)).toBeVisible();
      const list = (await (await request.get(`/api/qr?search=${encodeURIComponent(created.name)}`)).json()) as {
        items: { id: string; name: string; styleConfig: { frame?: Record<string, unknown> } }[];
      };
      const copy = list.items.find((item) => item.name === `${created.name} (copy)`)!;
      copyId = copy.id;
      expect(copy.styleConfig.frame).toMatchObject({ id: 'graduation', color: '#123456', caption: 'Well done' });

      // Removing the frame and saving returns the plain code.
      await page.goto(`/qr/${created.id}`);
      await styleTab(page).click();
      await page.getByTestId('qr-frame-none').click();
      await expect(preview(page).locator('svg[data-frame]')).toHaveCount(0);
      const saved = page.waitForResponse((r) => r.url().endsWith(`/api/qr/${created.id}`) && r.request().method() === 'PUT');
      await page.getByRole('button', { name: 'Save changes' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: /Save/ }).click();
      expect((await saved).ok()).toBeTruthy();
      const after = (await (await request.get(`/api/qr/${created.id}`)).json()) as { styleConfig: Record<string, unknown> };
      expect(after.styleConfig.frame).toBeUndefined();
    } finally {
      await deleteQR(request, created.id);
      if (copyId) await deleteQR(request, copyId);
    }
  });

  test('a code saved without a frame is unchanged and shows None', async ({ page, request }) => {
    const created = await createFramed(request, 'plain', 'no frame here');
    try {
      await page.goto(`/qr/${created.id}`);
      await expect(preview(page).locator('svg').first()).toBeVisible();
      await expect(preview(page).locator('svg[data-frame]')).toHaveCount(0);
      await styleTab(page).click();
      await expect(page.getByRole('radio', { name: /none/i })).toBeChecked();
      const saved = (await (await request.get(`/api/qr/${created.id}`)).json()) as { styleConfig: Record<string, unknown> };
      expect('frame' in saved.styleConfig).toBe(false);
    } finally {
      await deleteQR(request, created.id);
    }
  });

  test('designing a new code with a frame saves it into the style', async ({ page, request }) => {
    const name = qaName('save framed');
    await page.goto('/qr/new');
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByRole('textbox', { name: 'Website URL' }).fill('example.com');
    await pickFrame(page, 'pets');
    await page.getByRole('button', { name: 'Save QR code' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Save QR code' }).click();
    await expect(page).toHaveURL(/\/qr\/[0-9a-f-]{36}$/);
    const id = page.url().split('/').pop()!;
    try {
      const saved = (await (await request.get(`/api/qr/${id}`)).json()) as { styleConfig: { frame?: { id: string; caption?: string } } };
      expect(saved.styleConfig.frame).toMatchObject({ id: 'pets', caption: 'Meet our pet' });
    } finally {
      await deleteQR(request, id);
    }
  });
});

test.describe('QR frames: every design still scans', () => {
  for (const { id } of FRAMES) {
    test(`"${id}" is read by the health check (short and dense code, with the logo)`, async ({ page, request }) => {
      const short = await createFramed(request, `scan ${id}`, 'Hello from Memento QR', { id });
      const dense = await createFramed(request, `dense ${id}`, DENSE_TEXT, { id });
      try {
        const first = await verdictFor(page, short.name);
        expect(first.verdict).toBe('Looks good');
        expect(first.text).toContain('A test reader scanned it and read the right content.');

        const second = await verdictFor(page, dense.name);
        expect(second.verdict).not.toBe('Not working');
        expect(second.text).not.toMatch(/could not read|different from what/i);
      } finally {
        await deleteQR(request, short.id);
        await deleteQR(request, dense.id);
      }
    });
  }

  test('a frame with dark colours and a see-through code background still reads, with a warning', async ({ page, request }) => {
    const created = await createQR(request, {
      name: qaName('dark frame'),
      qrType: 'text',
      payload: 'Hello from Memento QR',
      styleConfig: { ...styleWithFrame({ id: 'business', color: '#000000', accentColor: '#000000' }), backgroundOpacity: 30 },
    });
    try {
      const result = await verdictFor(page, created.name);
      expect(result.verdict).toBe('Needs attention');
      expect(result.text).toMatch(/see-through/i);
      expect(result.text).not.toMatch(/could not read/i);
    } finally {
      await deleteQR(request, created.id);
    }
  });
});
