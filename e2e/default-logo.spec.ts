import { readFileSync } from 'node:fs';

import { test, expect, type Page } from '@playwright/test';

import { createQR, deleteQR, qaName } from './helpers/api';

const LOGO = '/memento-qr-logo.png';
const preview = (page: Page) => page.getByTestId('qr-preview-canvas');
const styleTab = (page: Page) => page.getByRole('tab', { name: 'Style' });

// A 1x1 transparent PNG, enough to stand in for somebody's own logo.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function saveText(page: Page, name: string, text: string): Promise<string> {
  await page.goto('/qr/new');
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByTestId('qr-type-text').click();
  await page.getByRole('textbox', { name: 'Text' }).fill(text);
  await page.getByRole('button', { name: 'Save QR code' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Save QR code' }).click();
  await expect(page).toHaveURL(/\/qr\/[0-9a-f-]{36}$/);
  return page.url().split('/').pop()!;
}

/** The "Is this QR working?" check renders the code, reads it back like a phone would, and gives a verdict. */
async function verdictFor(page: Page, name: string): Promise<string> {
  await page.goto('/qr');
  await page.getByPlaceholder('Search by name…').fill(name);
  await page.getByRole('button', { name: `Check that ${name} is working` }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Looks good|Needs attention|Not working/)).toBeVisible({ timeout: 30_000 });
  return (await dialog.getByText(/Looks good|Needs attention|Not working/).first().innerText()).trim();
}

test.describe('Default Memento QR logo', () => {
  test('a new code has the logo in the middle of its preview, and the Style tab says so', async ({ page }) => {
    await page.goto('/qr/new');
    await page.getByRole('textbox', { name: 'Website URL' }).fill('example.com');

    await expect(preview(page).locator('svg').first()).toBeVisible();
    await expect.poll(async () => preview(page).locator('image').count()).toBeGreaterThan(0);

    await styleTab(page).click();
    await expect(page.getByTestId('default-logo-note')).toContainText('Memento QR logo (default)');
    await expect(page.getByText('Logo size')).toBeVisible();
  });

  test('it can be removed (after asking), restored, or replaced with your own', async ({ page, request }) => {
    await page.goto('/qr/new');
    await page.getByRole('textbox', { name: 'Website URL' }).fill('example.com');
    await styleTab(page).click();

    // Cancelling changes nothing.
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('The Memento QR logo will be removed');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('default-logo-note')).toBeVisible();

    // Removing leaves a plain code.
    await page.getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByTestId('no-logo-note')).toBeVisible();
    await expect.poll(async () => preview(page).locator('image').count()).toBe(0);

    // ...and it can come back.
    await page.getByRole('button', { name: 'Use Memento logo' }).click();
    await expect(page.getByTestId('default-logo-note')).toBeVisible();
    await expect.poll(async () => preview(page).locator('image').count()).toBeGreaterThan(0);

    // Your own logo replaces it.
    const uploaded = page.waitForResponse((r) => r.url().endsWith('/api/upload') && r.request().method() === 'POST');
    await page.locator('input[type="file"]').first().setInputFiles({ name: 'my-logo.png', mimeType: 'image/png', buffer: PNG });
    const response = await uploaded;
    expect(response.status()).toBe(201);
    await expect(page.getByTestId('default-logo-note')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Replace logo' })).toBeVisible();
    await request.delete(`/api/upload/${((await response.json()) as { id: string }).id}`);
  });

  test('a saved code keeps the design it was saved with, and a code saved with the default logo reopens with it', async ({
    page,
    request,
  }) => {
    // A code that existed before the logo was added to new codes: nothing is added to it.
    const old = await createQR(request, {
      name: qaName('old-plain'),
      qrType: 'text',
      payload: 'plain old code',
      styleConfig: { dotStyle: 'square', dotColor: '#000000', backgroundColor: '#FFFFFF', errorCorrectionLevel: 'M', cardLayout: 'none' },
    });
    let newId: string | null = null;
    try {
      await page.goto(`/qr/${old.id}`);
      await styleTab(page).click();
      await expect(page.getByTestId('no-logo-note')).toBeVisible();
      await expect(page.getByTestId('default-logo-note')).toHaveCount(0);

      // A code made now is saved with the logo and reopens with it.
      newId = await saveText(page, qaName('new-branded'), 'branded code');
      const saved = (await (await request.get(`/api/qr/${newId}`)).json()) as { styleConfig: Record<string, unknown> };
      expect(saved.styleConfig).toMatchObject({ logoUrl: LOGO, logoSize: 0.3, errorCorrectionLevel: 'H' });
      await page.reload();
      await styleTab(page).click();
      await expect(page.getByTestId('default-logo-note')).toBeVisible();
    } finally {
      await deleteQR(request, old.id);
      if (newId) await deleteQR(request, newId);
    }
  });

  test('a code with the logo is still read by a scanner, short or long', async ({ page, request }) => {
    const ids: string[] = [];
    try {
      const shortName = qaName('scan-short');
      ids.push(await saveText(page, shortName, 'Hello from Memento QR'));
      expect(await verdictFor(page, shortName)).toBe('Looks good');

      // A fuller code (about 300 characters) has much smaller dots, so the logo hides more of them.
      const longName = qaName('scan-long');
      const longText = Array.from({ length: 12 }, (_, i) => `Line ${i + 1}: in loving memory of Ana, always in our hearts.`).join(' ');
      ids.push(await saveText(page, longName, longText.slice(0, 300)));
      const verdict = await verdictFor(page, longName);
      expect(verdict).not.toBe('Not working');
      await expect(page.getByRole('dialog')).not.toContainText(/could not read|cannot read|not be read/i);
    } finally {
      for (const id of ids) await deleteQR(request, id);
    }
  });

  // These are the codes this app makes most. With the logo they have a hole in the middle, and the
  // software reader in the check used to miss some of them at one particular size (reading them
  // fine at another, and a stronger reader reads all of them), so the check tries several sizes.
  for (const [label, text] of [
    ['a short link', 'https://memento-qr.vercel.app/q/k7x2mq'],
    ['a named link', 'https://memento-qr.vercel.app/q/ana-memorial'],
    ['a WhatsApp link', 'https://wa.me/639171234567'],
    ['a phone number', 'tel:+639171234567'],
  ] as const) {
    test(`the check can read ${label} with the logo`, async ({ page, request }) => {
      const name = qaName('common');
      const id = await saveText(page, name, text);
      try {
        await verdictFor(page, name); // opens the check and waits for its answer
        // (A made-up web address can still be reported as unreachable; what matters here is the reader.)
        const report = await page.getByRole('dialog').innerText();
        expect(report).not.toContain('A QR reader could not read this code');
        expect(report).not.toContain('a reader failed when it was shown small');
        expect(report).not.toContain('read something different');
      } finally {
        await deleteQR(request, id);
      }
    });
  }

  test('the downloaded SVG carries the logo inside the file, not a link that would break elsewhere', async ({ page }) => {
    await page.goto('/qr/new');
    await page.getByRole('textbox', { name: 'Website URL' }).fill('example.com');
    await expect.poll(async () => preview(page).locator('image').count()).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Download' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'SVG (vector)' }).click()]);
    const svg = readFileSync((await download.path())!, 'utf8');

    expect(svg).toContain('<image');
    expect(svg).toContain('data:image/png;base64');
    expect(svg).not.toContain(LOGO);
  });

  test('applying a template keeps the logo, and a card layout does not show it a second time', async ({ page }) => {
    await page.goto('/qr/new');
    await page.getByRole('textbox', { name: 'Website URL' }).fill('example.com');

    await styleTab(page).click();
    await page.getByRole('button', { name: 'Choose template' }).click();
    await page.getByTestId('qr-template-business-blue').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByTestId('default-logo-note')).toBeVisible();

    await page.getByRole('tab', { name: 'Layout' }).click();
    await page.getByTestId('qr-layout-horizontal').click();
    await expect(page.locator(`main img[src="${LOGO}"]:visible`)).toHaveCount(0); // not repeated as a card avatar
    await expect.poll(async () => preview(page).locator('image').count()).toBeGreaterThan(0); // still in the code
  });
});
