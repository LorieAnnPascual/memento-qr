import { test, expect, type Page } from '@playwright/test';

import { deleteQR, qaName } from './helpers/api';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const payload = (page: Page) => page.getByTestId('qr-payload-preview');
const preview = (page: Page) => page.getByTestId('qr-preview-canvas').locator('canvas, svg').first();

test.describe('QR generator: content types and live preview', () => {
  test('URL: preview appears and encodes the address @mobile', async ({ page }) => {
    await page.goto('/qr/new');
    // Typed like a person (WebKit's fill() does not always fire React's change event).
    await page.getByRole('textbox', { name: 'Website URL' }).pressSequentially('example.com');

    await expect(preview(page)).toBeVisible({ timeout: 5_000 });
    await expect(payload(page)).toHaveText('https://example.com');
  });

  test('Plain text is encoded as written', async ({ page }) => {
    await page.goto('/qr/new');
    await page.getByTestId('qr-type-text').click();
    await page.locator('#qr-text').fill('Hello, Memento!');

    await expect(payload(page)).toHaveText('Hello, Memento!');
  });

  test('Phone becomes a tel: link', async ({ page }) => {
    await page.goto('/qr/new');
    await page.getByTestId('qr-type-phone').click();
    await page.locator('#qr-phone').fill('+639171234567');

    await expect(payload(page)).toHaveText('tel:+639171234567');
  });

  test('WiFi builds the WIFI: string and escapes special characters', async ({ page }) => {
    await page.goto('/qr/new');
    await page.getByTestId('qr-type-wifi').click();
    await page.getByLabel('Network name (SSID)').fill('Cafe;Net');
    await page.getByLabel('Password', { exact: true }).fill('pass:word');

    await expect(payload(page)).toHaveText('WIFI:T:WPA;S:Cafe\\;Net;P:pass\\:word;H:false;;');
    await expect(preview(page)).toBeVisible();
  });

  test('vCard builds a contact card', async ({ page }) => {
    await page.goto('/qr/new');
    await page.getByTestId('qr-type-vcard').click();
    await page.getByLabel('First name').fill('Juan');
    await page.getByLabel('Last name').fill('Dela Cruz');
    await page.getByLabel('Work phone').fill('+639171234567');
    await page.getByLabel('Email', { exact: true }).fill('juan@example.com');

    const text = await payload(page).innerText();
    expect(text).toContain('BEGIN:VCARD');
    expect(text).toContain('FN:Juan Dela Cruz');
    expect(text).toContain('+639171234567');
    expect(text).toContain('juan@example.com');
    expect(text).toContain('END:VCARD');
  });

  test('every content type can be selected', async ({ page }) => {
    await page.goto('/qr/new');

    for (const type of ['url', 'text', 'phone', 'sms', 'email', 'wifi', 'vcard', 'whatsapp', 'event', 'location', 'social']) {
      await page.getByTestId(`qr-type-${type}`).click();
      await expect(page.getByTestId(`qr-type-${type}`)).toHaveAttribute('aria-checked', 'true');
    }
  });

  test('nothing to export until content is entered', async ({ page }) => {
    await page.goto('/qr/new');
    await page.getByRole('button', { name: 'Download' }).click();
    await page.getByRole('menuitem', { name: 'PNG' }).click();

    await expect(page.getByText('Fill in the QR content before exporting.')).toBeVisible();
  });
});

test.describe('QR generator: styling', () => {
  test('changing the dot style updates the preview', async ({ page }) => {
    await page.goto('/qr/new');
    await page.getByRole('textbox', { name: 'Website URL' }).fill('example.com');
    await expect(preview(page)).toBeVisible();
    const before = await page.getByTestId('qr-preview-canvas').innerHTML();

    await page.getByRole('combobox', { name: 'Dot style', exact: true }).click();
    await page.getByRole('option').filter({ hasNotText: /rounded/i }).first().click();

    await expect.poll(async () => page.getByTestId('qr-preview-canvas').innerHTML(), { timeout: 5_000 }).not.toBe(before);
  });

  test('applying a template restyles the code', async ({ page }) => {
    await page.goto('/qr/new');
    await page.getByRole('textbox', { name: 'Website URL' }).fill('example.com');
    await page.getByRole('button', { name: 'Choose template' }).click();
    await expect(page.getByRole('dialog').getByText('Choose a template')).toBeVisible();

    await page.getByTestId('qr-template-business-blue').click();

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(preview(page)).toBeVisible();
  });

  test('uploading a logo shows the logo controls', async ({ page }) => {
    await page.goto('/qr/new');
    await page.getByRole('textbox', { name: 'Website URL' }).fill('example.com');

    const uploaded = page.waitForResponse((r) => r.url().endsWith('/api/upload') && r.request().method() === 'POST');
    await page.locator('input[type="file"]').first().setInputFiles({ name: 'qa-logo.png', mimeType: 'image/png', buffer: PNG });
    const response = await uploaded;

    expect(response.status()).toBe(201);
    await expect(page.getByText('Logo size')).toBeVisible();
    const { id } = (await response.json()) as { id: string };
    await page.request.delete(`/api/upload/${id}`);
  });
});

test.describe('QR generator: downloads', () => {
  for (const [label, extension] of [
    ['PNG', 'png'],
    ['SVG (vector)', 'svg'],
    ['JPEG', 'jpeg'],
    ['WebP', 'webp'],
  ] as const) {
    test(`downloads a ${extension} file`, async ({ page }) => {
      await page.goto('/qr/new');
      await page.getByRole('textbox', { name: 'Website URL' }).fill('example.com');
      await expect(preview(page)).toBeVisible();

      await page.getByRole('button', { name: 'Download' }).click();
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: label }).click()]);

      expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`));
    });
  }

  test('the downloaded SVG is a real, scalable SVG', async ({ page }) => {
    await page.goto('/qr/new');
    await page.getByRole('textbox', { name: 'Website URL' }).fill('example.com');
    await expect(preview(page)).toBeVisible();

    await page.getByRole('button', { name: 'Download' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'SVG (vector)' }).click()]);
    const path = await download.path();
    const { readFileSync } = await import('node:fs');
    const svg = readFileSync(path, 'utf8');

    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox');
    expect(svg).not.toContain('<script');
  });

  test('the print export is available at high resolution', async ({ page }) => {
    await page.goto('/qr/new');
    await page.getByRole('textbox', { name: 'Website URL' }).fill('example.com');
    await expect(preview(page)).toBeVisible();

    await page.getByRole('button', { name: 'Download' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /High-res SVG/ }).click()]);

    expect(download.suggestedFilename()).toMatch(/\.svg$/);
  });
});

test.describe('QR generator: saving', () => {
  test('save, find it in the list, edit and see the change persist', async ({ page, request }) => {
    const name = qaName('generator');

    await page.goto('/qr/new');
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByRole('textbox', { name: 'Website URL' }).fill('https://example.com/original');

    await page.getByRole('button', { name: 'Save QR code' }).click();
    // Nothing is written until the person confirms.
    await expect(page.getByRole('alertdialog')).toContainText('Save this QR code?');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Save QR code' }).click();

    await expect(page.getByText('QR code saved')).toBeVisible();
    await expect(page).toHaveURL(/\/qr\/[0-9a-f-]{36}$/);
    const id = page.url().split('/').pop()!;

    try {
      // Appears in the list.
      await page.goto('/qr');
      await page.getByPlaceholder('Search by name…').fill(name);
      await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();

      // Edit and save; the change survives a reload.
      await page.goto(`/qr/${id}`);
      await page.getByRole('textbox', { name: 'Website URL' }).fill('https://example.com/changed');
      await page.getByRole('button', { name: 'Save changes' }).click();
      const saved = page.waitForResponse((r) => r.url().endsWith(`/api/qr/${id}`) && r.request().method() === 'PUT');
      await page.getByRole('alertdialog').getByRole('button', { name: 'Save changes' }).click();
      expect((await saved).status()).toBe(200);

      await page.reload();
      await expect(page.getByRole('textbox', { name: 'Website URL' })).toHaveValue('https://example.com/changed');
      // Staying on the page after saving (not sent back to the list).
      await expect(page).toHaveURL(`/qr/${id}`);
    } finally {
      await deleteQR(request, id);
    }
  });

  test('cancelling the confirmation saves nothing', async ({ page, request }) => {
    const name = qaName('cancel');
    await page.goto('/qr/new');
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByRole('textbox', { name: 'Website URL' }).fill('example.com');

    await page.getByRole('button', { name: 'Save QR code' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();

    const list = (await (await request.get(`/api/qr?search=${encodeURIComponent(name)}`)).json()) as { items: unknown[] };
    expect(list.items).toEqual([]);
  });

  test('a QR without a name or content cannot be saved', async ({ page }) => {
    await page.goto('/qr/new');
    await page.getByRole('button', { name: 'Save QR code' }).click();

    await expect(page.getByRole('alertdialog')).toBeHidden();
    await expect(page.getByRole('status').or(page.locator('[data-sonner-toast]')).first()).toBeVisible();
  });

  test('deleting asks first, then removes the code', async ({ page, request }) => {
    const name = qaName('delete');
    const response = await request.post('/api/qr', {
      data: { name, qrType: 'url', payload: 'https://example.com/del', styleConfig: {} },
    });
    const { id } = (await response.json()) as { id: string };

    await page.goto('/qr');
    await page.getByPlaceholder('Search by name…').fill(name);
    await page.getByRole('button', { name: `Delete ${name}` }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Delete this QR code?');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByText('QR code deleted')).toBeVisible();
    await expect(page.getByRole('cell', { name, exact: true })).toBeHidden();
    expect((await request.get(`/api/qr/${id}`)).status()).toBe(404);
  });
});
