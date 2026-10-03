import { test, expect, request as playwrightRequest, type APIRequestContext, type Page } from '@playwright/test';

import { createPage, createQR, deletePage, deleteQR, qaName } from './helpers/api';
import { EMPTY_STATE } from './helpers/users';

/** A name nobody has used before (links are unique across the whole database). */
function freshSlug(label: string): string {
  return `qa-${label}-${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 2).toString(36)}`.slice(0, 30);
}

/** A visitor with no session, like someone scanning a printed code. */
async function visitor(baseURL: string | undefined) {
  return playwrightRequest.newContext({ baseURL, storageState: EMPTY_STATE });
}

async function scan(baseURL: string | undefined, code: string) {
  const anon = await visitor(baseURL);
  try {
    const response = await anon.get(`/q/${code}`, { maxRedirects: 0 });
    return { status: response.status(), location: response.headers()['location'], body: await response.text() };
  } finally {
    await anon.dispose();
  }
}

async function openDynamicTab(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Dynamic QR' }).click();
}

async function saveQr(page: Page, label: 'Save QR code' | 'Save changes'): Promise<void> {
  await page.getByRole('button', { name: label }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: label }).click();
}

const slugField = (page: Page) => page.getByLabel('Custom link name (optional)');

test.describe('Custom link names for QR codes', () => {
  test('choose a name, scan it, rename it: the old link keeps working', async ({ page, request, baseURL }) => {
    const first = freshSlug('menu');
    const second = freshSlug('menu2');
    const name = qaName('custom-link');

    await page.goto('/qr/new');
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByRole('textbox', { name: 'Website URL' }).fill('https://example.com/target');
    await openDynamicTab(page);
    await page.getByRole('switch', { name: 'Make this dynamic' }).click();

    // What is typed is cleaned up as it goes, and the live check says it is free.
    await slugField(page).fill(first.toUpperCase().replace(/-/g, ' '));
    await expect(slugField(page)).toHaveValue(first);
    await expect(page.getByText('Available', { exact: true })).toBeVisible();

    await saveQr(page, 'Save QR code');
    await expect(page).toHaveURL(/\/qr\/[0-9a-f-]{36}$/);
    const id = page.url().split('/').pop()!;

    try {
      const saved = (await (await request.get(`/api/qr/${id}`)).json()) as { shortCode: string; payload: string };
      expect(saved.shortCode).toBe(first);
      expect(saved.payload).toMatch(new RegExp(`/q/${first}$`)); // the printed code encodes the nice link

      // Scanning the chosen link works, and capital letters do not matter.
      expect(await scan(baseURL, first)).toMatchObject({ status: 302, location: 'https://example.com/target' });
      expect((await scan(baseURL, first.toUpperCase())).status).toBe(302);

      // --- rename it
      await openDynamicTab(page);
      await slugField(page).fill(second);
      await expect(page.getByText('Available', { exact: true })).toBeVisible();
      await expect(page.getByText(/will keep working/)).toContainText(first);
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(page.getByRole('alertdialog')).toContainText(`/q/${first} to /q/${second}`);
      const saving = page.waitForResponse((r) => /\/api\/qr\/[0-9a-f-]{36}$/.test(r.url()) && r.request().method() === 'PUT');
      await page.getByRole('alertdialog').getByRole('button', { name: 'Save changes' }).click();
      expect((await saving).status()).toBe(200);

      const renamed = (await (await request.get(`/api/qr/${id}`)).json()) as { shortCode: string; payload: string };
      expect(renamed.shortCode).toBe(second);
      expect(renamed.payload).toMatch(new RegExp(`/q/${second}$`));

      // The new link works AND the old, already-printed one still does: same destination.
      expect(await scan(baseURL, second)).toMatchObject({ status: 302, location: 'https://example.com/target' });
      expect(await scan(baseURL, first)).toMatchObject({ status: 302, location: 'https://example.com/target' });

      // A change of destination reaches both.
      await request.put(`/api/qr/${id}`, { data: { isDynamic: true, payload: 'https://example.com/changed' } });
      expect((await scan(baseURL, first)).location).toBe('https://example.com/changed');

      // Scans through the old and the new link are counted on the same code.
      await expect
        .poll(async () => ((await (await request.get(`/api/qr/${id}`)).json()) as { scanCount: number }).scanCount, { timeout: 15_000 })
        .toBe(5);

      // Pausing the code explains itself on the old link too (it is not "not found").
      await request.put(`/api/qr/${id}`, { data: { isDynamic: true, isPaused: true } });
      const paused = await scan(baseURL, first);
      expect(paused.status).toBe(410);
      expect(paused.body).toContain('Paused');
      await request.put(`/api/qr/${id}`, { data: { isDynamic: true, isPaused: false } });

      // --- it can take its first name back
      const back = await request.put(`/api/qr/${id}`, { data: { isDynamic: true, slug: first } });
      expect(back.status()).toBe(200);
      expect(((await back.json()) as { shortCode: string }).shortCode).toBe(first);
      expect((await scan(baseURL, first)).status).toBe(302);
      expect((await scan(baseURL, second)).status).toBe(302); // and the name it just left now forwards
    } finally {
      await deleteQR(request, id);
    }
  });

  test('a name somebody else has is refused, in the form and by the server', async ({ page, request }) => {
    const taken = freshSlug('taken');
    const other = await createQR(request, { name: qaName('owner'), isDynamic: true, slug: taken });
    try {
      expect(other.shortCode).toBe(taken);

      await page.goto('/qr/new');
      await page.getByLabel('Name', { exact: true }).fill(qaName('wants-taken'));
      await page.getByRole('textbox', { name: 'Website URL' }).fill('https://example.com/x');
      await openDynamicTab(page);
      await page.getByRole('switch', { name: 'Make this dynamic' }).click();
      await slugField(page).fill(taken);

      await expect(page.getByText('That link name is already taken.')).toBeVisible();
      await page.getByRole('button', { name: 'Save QR code' }).click();
      await expect(page.getByText('Fix the link name on the Dynamic QR tab before saving.')).toBeVisible();
      await expect(page.getByRole('alertdialog')).toHaveCount(0);

      // The server refuses it too, whatever the form says.
      const direct = await request.post('/api/qr', {
        data: { name: qaName('direct'), qrType: 'url', payload: 'https://example.com/y', styleConfig: {}, isDynamic: true, slug: taken },
      });
      expect(direct.status()).toBe(409);
      expect((await direct.json()).code).toBe('SLUG_TAKEN');
    } finally {
      await deleteQR(request, other.id);
    }
  });

  test('names that are too short or have odd characters are explained', async ({ page }) => {
    await page.goto('/qr/new');
    await page.getByRole('textbox', { name: 'Website URL' }).fill('https://example.com/x');
    await openDynamicTab(page);
    await page.getByRole('switch', { name: 'Make this dynamic' }).click();

    await slugField(page).fill('ab');
    await expect(page.getByText(/at least 3/)).toBeVisible();

    await slugField(page).fill('Ana Memorial!');
    await expect(slugField(page)).toHaveValue('ana-memorial');
  });

  test('without a name the link is random, as before', async ({ request, baseURL }) => {
    const qr = await createQR(request, { name: qaName('random'), isDynamic: true });
    try {
      expect(qr.shortCode).toMatch(/^[2-9a-hj-km-np-z]{6}$/);
      expect((await scan(baseURL, qr.shortCode!)).status).toBe(302);
    } finally {
      await deleteQR(request, qr.id);
    }
  });

  test('the availability check and the new routes need a login', async ({ baseURL }) => {
    const anon = await visitor(baseURL);
    try {
      expect((await anon.get('/api/slugs/check?kind=qr&slug=anything')).status()).toBe(401);
      expect((await anon.put('/api/pages/00000000-0000-4000-8000-000000000000/slug', { data: { slug: 'anything' } })).status()).toBe(401);
    } finally {
      await anon.dispose();
    }
  });

  test('the availability check reports taken, free and invalid names', async ({ request }) => {
    const taken = freshSlug('chk');
    const qr = await createQR(request, { name: qaName('chk'), isDynamic: true, slug: taken });
    try {
      const check = async (slug: string, extra = '') =>
        (await (await request.get(`/api/slugs/check?kind=qr&slug=${encodeURIComponent(slug)}${extra}`)).json()) as {
          valid: boolean;
          available: boolean;
        };

      expect(await check(taken)).toMatchObject({ valid: true, available: false });
      expect(await check(`${taken}-free`.slice(0, 30))).toMatchObject({ valid: true, available: true });
      expect(await check('ab')).toMatchObject({ valid: false, available: false });
      // The code that owns a name may keep it.
      expect(await check(taken, `&excludeId=${qr.id}`)).toMatchObject({ available: true });
      // /q/ and /p/ names are separate: a page may use the same name as a QR code.
      const page = (await (await request.get(`/api/slugs/check?kind=page&slug=${taken}`)).json()) as { available: boolean };
      expect(page.available).toBe(true);
    } finally {
      await deleteQR(request, qr.id);
    }
  });
});

test.describe('Custom link names for pages', () => {
  async function publishedPage(request: APIRequestContext, slug: string): Promise<{ id: string; name: string }> {
    const created = await createPage(request, { name: qaName('link-page') });
    const response = await request.post(`/api/pages/${created.id}/publish`, { data: { expiresAt: null, slug } });
    expect(response.status()).toBe(200);
    expect(((await response.json()) as { shortCode: string }).shortCode).toBe(slug);
    return created;
  }

  async function open(baseURL: string | undefined, code: string) {
    const anon = await visitor(baseURL);
    try {
      const response = await anon.get(`/p/${code}`);
      return { status: response.status(), url: response.url(), body: await response.text() };
    } finally {
      await anon.dispose();
    }
  }

  test('publish at a chosen link, rename it, and the old link forwards to the new one', async ({ request, baseURL }) => {
    const first = freshSlug('page');
    const second = freshSlug('page2');
    const created = await publishedPage(request, first);
    try {
      expect(await open(baseURL, first)).toMatchObject({ status: 200 });

      const rename = await request.put(`/api/pages/${created.id}/slug`, { data: { slug: second } });
      expect(rename.status()).toBe(200);
      expect(((await rename.json()) as { url: string }).url).toMatch(new RegExp(`/p/${second}$`));

      const viaNew = await open(baseURL, second);
      expect(viaNew.status).toBe(200);

      // The old link still opens the page, and the visitor ends up at the new address.
      const viaOld = await open(baseURL, first);
      expect(viaOld.status).toBe(200);
      expect(viaOld.url).toMatch(new RegExp(`/p/${second}$`));
      expect(viaOld.body).toContain(created.name); // the same page (its title)
      expect(viaNew.body).toContain(created.name);

      // Capital letters in a shared link are forgiven.
      expect((await open(baseURL, second.toUpperCase())).status).toBe(200);

      // A page nobody can see stays hidden through its old link as well.
      await request.delete(`/api/pages/${created.id}/publish`);
      expect((await open(baseURL, first)).status).toBe(404);
      expect((await open(baseURL, second)).status).toBe(404);
    } finally {
      await deletePage(request, created.id);
    }
  });

  test('a page name that is taken, or not allowed, is refused', async ({ request }) => {
    const taken = freshSlug('ptaken');
    const owner = await publishedPage(request, taken);
    const second = await createPage(request, { name: qaName('wants-name') });
    try {
      const clash = await request.post(`/api/pages/${second.id}/publish`, { data: { expiresAt: null, slug: taken } });
      expect(clash.status()).toBe(409);

      const clashRename = await request.put(`/api/pages/${second.id}/slug`, { data: { slug: taken } });
      expect(clashRename.status()).toBe(409);

      expect((await request.put(`/api/pages/${second.id}/slug`, { data: { slug: 'ab' } })).status()).toBe(400);
      expect((await request.put(`/api/pages/${second.id}/slug`, { data: { slug: '' } })).status()).toBe(400);
    } finally {
      await deletePage(request, owner.id);
      await deletePage(request, second.id);
    }
  });

  test('the publish dialog lets you choose the link and change it later', async ({ page, request, baseURL }) => {
    const first = freshSlug('ui');
    const second = freshSlug('ui2');
    const created = await createPage(request, { name: qaName('ui-page') });
    try {
      await page.goto(`/pages/${created.id}`);
      await page.getByRole('button', { name: 'Publish', exact: true }).click();
      await slugField(page).fill(first);
      await expect(page.getByText('Available', { exact: true })).toBeVisible();

      await page.getByRole('dialog').getByRole('button', { name: 'Publish', exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Publish' }).click();
      await expect(page.getByText('Page published')).toBeVisible();
      await expect(page.getByRole('dialog').getByRole('textbox', { name: /^http/ }).or(page.getByRole('dialog').locator(`input[value$="/p/${first}"]`))).toBeVisible();
      expect((await open(baseURL, first)).status).toBe(200);

      // Change it: a confirmation spells out that the old link keeps working.
      await slugField(page).fill(second);
      await expect(page.getByText('Available', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Change link' }).click();
      await expect(page.getByRole('alertdialog')).toContainText(`/p/${first} to /p/${second}`);
      await page.getByRole('alertdialog').getByRole('button', { name: 'Change link' }).click();
      await expect(page.getByText('Link updated. The old link still works.')).toBeVisible();

      const saved = (await (await request.get(`/api/pages/${created.id}`)).json()) as { shortCode: string };
      expect(saved.shortCode).toBe(second);
      expect((await open(baseURL, second)).status).toBe(200);
      expect((await open(baseURL, first)).url).toMatch(new RegExp(`/p/${second}$`));
    } finally {
      await deletePage(request, created.id);
    }
  });
});
