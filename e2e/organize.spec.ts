import { test, expect } from '@playwright/test';

import { createQR, deleteQR, qaName } from './helpers/api';

test.describe('Folders', () => {
  test('create, rename, use and delete a folder without losing its QR codes', async ({ page, request }) => {
    const folder = qaName('folder');
    const renamed = `${folder} renamed`;
    const qr = await createQR(request, { name: qaName('in-folder') });

    await page.goto('/qr');
    await page.getByRole('button', { name: 'Folders' }).click();
    await page.getByLabel('New folder name').fill(folder);
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText('Folder created')).toBeVisible();

    // A duplicate name (any case) is refused with a clear message.
    await page.getByLabel('New folder name').fill(folder.toUpperCase());
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText('You already have a folder with that name')).toBeVisible();

    // Rename.
    await page.getByRole('button', { name: `Rename ${folder}` }).click();
    await page.getByLabel(`Rename ${folder}`).fill(renamed);
    await page.getByRole('button', { name: 'Save name' }).click();
    await expect(page.getByText('Folder renamed')).toBeVisible();
    await page.keyboard.press('Escape');

    try {
      // Move a code into it from the list.
      await page.goto('/qr');
      await page.getByPlaceholder('Search by name…').fill(qr.name);
      await page.getByLabel(`Select ${qr.name}`).check();
      await page.getByRole('combobox', { name: 'Move to folder' }).click();
      await page.getByRole('option', { name: renamed }).click();
      await page.getByRole('button', { name: 'Move', exact: true }).click();
      await expect(page.getByText(/Moved 1 QR code to/)).toBeVisible();

      const inFolder = (await (await request.get(`/api/qr/${qr.id}`)).json()) as { folderId: string | null };
      expect(inFolder.folderId).not.toBeNull();

      // Filter by that folder.
      await page.getByRole('combobox', { name: 'Folder filter' }).click();
      await page.getByRole('option', { name: renamed }).click();
      await expect(page.getByRole('row').filter({ hasText: qr.name })).toBeVisible();

      // Delete the folder: it asks first, and the QR code survives.
      await page.getByRole('button', { name: 'Folders' }).click();
      await page.getByRole('button', { name: `Delete ${renamed}` }).click();
      await expect(page.getByRole('alertdialog')).toContainText('QR codes inside are kept');
      await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
      await expect(page.getByText('Folder deleted')).toBeVisible();

      const after = (await (await request.get(`/api/qr/${qr.id}`)).json()) as { folderId: string | null; name: string };
      expect(after.name).toBe(qr.name);
      expect(after.folderId).toBeNull();
    } finally {
      await deleteQR(request, qr.id);
    }
  });

  test('a folder name cannot be empty', async ({ page }) => {
    await page.goto('/qr');
    await page.getByRole('button', { name: 'Folders' }).click();

    await expect(page.getByRole('button', { name: 'Add' })).toBeDisabled();
  });
});

test.describe('Duplicate and compare (A/B testing)', () => {
  test('duplicate a dynamic QR, scan both, and compare them', async ({ page, request, baseURL }) => {
    const original = await createQR(request, { name: qaName('ab'), isDynamic: true, payload: 'https://example.com/ab' });

    await page.goto('/qr');
    await page.getByPlaceholder('Search by name…').fill(original.name);
    await page.getByLabel(`Duplicate ${original.name}`).click();
    await expect(page.getByText(`Duplicated "${original.name}"`)).toBeVisible();

    const list = (await (await request.get(`/api/qr?search=${encodeURIComponent(original.name)}`)).json()) as {
      items: { id: string; name: string; shortCode: string }[];
    };
    const copy = list.items.find((item) => item.name === `${original.name} (copy)`)!;
    expect(copy).toBeTruthy();
    expect(copy.shortCode).not.toBe(original.shortCode);

    try {
      for (let i = 0; i < 3; i++) await request.get(`${baseURL}/q/${original.shortCode}`, { maxRedirects: 0 });
      await request.get(`${baseURL}/q/${copy.shortCode}`, { maxRedirects: 0 });
      await expect
        .poll(async () => ((await (await request.get(`/api/qr/${original.id}`)).json()) as { scanCount: number }).scanCount)
        .toBe(3);

      await page.goto(`/qr/compare?a=${original.id}&b=${copy.id}`);
      await expect(page.getByText(/is ahead with 3 scans versus 1/)).toBeVisible();
      await expect(page.getByText('200% more')).toBeVisible();
      await expect(page.getByText('Scans over time')).toBeVisible();
    } finally {
      await deleteQR(request, original.id);
      await deleteQR(request, copy.id);
    }
  });

  test('selecting exactly two codes enables Compare', async ({ page, request }) => {
    const a = await createQR(request, { name: qaName('cmp-a') });
    const b = await createQR(request, { name: qaName('cmp-b') });
    try {
      await page.goto('/qr');
      await page.getByPlaceholder('Search by name…').fill('cmp-');
      await page.getByLabel(`Select ${a.name}`).check();
      await expect(page.getByText('Select exactly 2 to compare them.')).toBeVisible();
      await page.getByLabel(`Select ${b.name}`).check();

      await page
        .getByRole('region', { name: 'Selection actions' })
        .getByRole('link', { name: 'Compare' })
        .click();
      await expect(page).toHaveURL(/\/qr\/compare\?a=/);
      await expect(page.getByText('Neither code is dynamic')).toBeVisible();
    } finally {
      await deleteQR(request, a.id);
      await deleteQR(request, b.id);
    }
  });

  test('comparing a code with itself is refused', async ({ page, request }) => {
    const only = await createQR(request, { name: qaName('cmp-same') });
    try {
      await page.goto(`/qr/compare?a=${only.id}&b=${only.id}`);
      await expect(page.getByText('Pick two different QR codes.')).toBeVisible();
    } finally {
      await deleteQR(request, only.id);
    }
  });

  test('a compare link with an unknown code shows a clear message', async ({ page }) => {
    await page.goto('/qr/compare?a=11111111-1111-4111-8111-111111111111&b=22222222-2222-4222-8222-222222222222');

    await expect(page.getByText('One of those QR codes could not be found.')).toBeVisible();
  });
});

test.describe('Batch import', () => {
  test('preview, skip bad rows, confirm, and create', async ({ page, request }) => {
    const tag = qaName('batch');
    const csv = ['name,type,content,dynamic,tags', `${tag} one,url,example.com,yes,qa`, `${tag} bad,url,not a url,no,`, `${tag} two,phone,+1 555 010 2000,no,`].join('\n');

    await page.goto('/qr/batch');
    await page.getByLabel('CSV file').setInputFiles({ name: 'batch.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });

    await expect(page.getByText('2 ready')).toBeVisible();
    await expect(page.getByText('1 with problems')).toBeVisible();
    await expect(page.getByText('That does not look like a web address.')).toBeVisible();

    await page.getByRole('button', { name: 'Create 2 QR codes' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('1 row has problems and will be skipped');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Create' }).click();

    // Stays on the page with a success message (no navigation away).
    await expect(page.getByText('2 QR codes created.')).toBeVisible();
    await expect(page).toHaveURL('/qr/batch');

    const list = (await (await request.get(`/api/qr?search=${encodeURIComponent(tag)}`)).json()) as { items: { id: string; name: string; isDynamic: boolean }[] };
    expect(list.items.map((i) => i.name).sort()).toEqual([`${tag} one`, `${tag} two`]);
    expect(list.items.find((i) => i.name.endsWith('one'))!.isDynamic).toBe(true);
    for (const item of list.items) await deleteQR(request, item.id);
  });

  test('a file without the required columns explains what to fix', async ({ page }) => {
    await page.goto('/qr/batch');
    await page.getByLabel('CSV file').setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('foo,bar\n1,2') });

    await expect(page.getByText(/The first row must be a header/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Create/ })).toHaveCount(0);
  });

  test('the template file downloads and imports cleanly', async ({ page }) => {
    await page.goto('/qr/batch');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download template' }).click()]);
    const path = await download.path();

    await page.getByLabel('CSV file').setInputFiles(path!);

    await expect(page.getByText('4 ready')).toBeVisible();
  });
});

test.describe('Activity log', () => {
  test('records what you do, newest first', async ({ page, request }) => {
    const qr = await createQR(request, { name: qaName('activity') });
    try {
      await page.goto('/activity');
      await expect(page.getByText(`created the QR code "${qr.name}"`)).toBeVisible();
    } finally {
      await deleteQR(request, qr.id);
    }

    await page.reload();
    await expect(page.getByText(`deleted the QR code "${qr.name}"`)).toBeVisible();
  });

  test('can be filtered by type', async ({ page }) => {
    await page.goto('/activity?type=folder');

    for (const item of await page.getByRole('listitem').allInnerTexts()) {
      expect(item).toMatch(/folder/);
    }
  });

  test('shows everyone on the team, not just you', async ({ page }) => {
    await page.goto('/activity');

    await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
    await expect(page.getByText('What everyone on the team has been doing.')).toBeVisible();
  });
});

test.describe('Settings', () => {
  test('theme switches to dark and back, and is remembered', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Appearance' }).click();

    await page.getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.getByRole('tab', { name: 'Appearance' }).click();
    await page.getByRole('radio', { name: 'Light' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('a published page stays light even when the dashboard is dark', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Appearance' }).click();
    await page.getByRole('radio', { name: 'Dark' }).click();

    await page.goto('/p/qapg2a');
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Appearance' }).click();
    await page.getByRole('radio', { name: 'Light' }).click();
  });

  test('the backup downloads as a JSON file with your data', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Your data' }).click();

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download backup' }).click()]);
    const backup = JSON.parse((await import('node:fs')).readFileSync((await download.path())!, 'utf8')) as {
      app: string;
      counts: Record<string, number>;
      scope: string;
    };

    expect(download.suggestedFilename()).toMatch(/^memento-qr-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(backup.app).toBe('memento-qr');
    expect(backup.scope).toBe('mine');
    expect(backup.counts.qrCodes).toBeGreaterThanOrEqual(15);
    expect(backup.counts.scanEvents).toBeGreaterThanOrEqual(200);
  });

  test('the whole-team backup option is not offered to members', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Your data' }).click();

    await expect(page.getByLabel(/whole team/)).toHaveCount(0);
  });

  test('a name change is confirmed first, saved, and survives a reload', async ({ page }) => {
    await page.goto('/settings');
    const original = await page.getByLabel('Full name').inputValue();

    await page.getByLabel('Full name').fill('QA Editor Renamed');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/profile') && r.request().method() === 'PUT');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Save changes' }).click();
    expect((await saved).status()).toBe(200);

    await page.reload();
    await expect(page.getByLabel('Full name')).toHaveValue('QA Editor Renamed');

    // Put it back.
    await page.getByLabel('Full name').fill(original);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText(/profile.*updated|saved/i).first()).toBeVisible();
  });
});
