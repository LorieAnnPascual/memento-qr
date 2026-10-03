import { test, expect, request as playwrightRequest, type Page } from '@playwright/test';

import { createPage, createQR, deletePage, deleteQR, qaName } from './helpers/api';
import { EMPTY_STATE } from './helpers/users';

/** A name nobody has used before (links are unique across the whole database). */
function freshSlug(label: string): string {
  return `qa-${label}-${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 2).toString(36)}`.slice(0, 30);
}

/** A visitor with no session, like someone scanning a printed code. Redirects are not followed. */
async function visit(baseURL: string | undefined, path: string) {
  const anon = await playwrightRequest.newContext({ baseURL, storageState: EMPTY_STATE });
  try {
    const response = await anon.get(path, { maxRedirects: 0 });
    return { status: response.status(), headers: response.headers(), body: await response.text() };
  } finally {
    await anon.dispose();
  }
}

async function scanCount(page: Page, id: string): Promise<number> {
  return ((await (await page.request.get(`/api/qr/${id}`)).json()) as { scanCount: number }).scanCount;
}

const slugField = (page: Page) => page.getByLabel('Custom link name (optional)');
const forwardField = (page: Page) => page.getByLabel('Old link to forward');

test.describe('Reusing the link of a deleted QR code', () => {
  test('a deleted code’s link needs a confirmation to be reused, and then the old printed code reaches the new one', async ({
    page,
    request,
    baseURL,
  }) => {
    const slug = freshSlug('samsam');
    const old = await createQR(request, { name: qaName('old-samsam'), isDynamic: true, slug, payload: 'https://example.com/old' });
    expect(old.shortCode).toBe(slug);
    await deleteQR(request, old.id); // gone from the app, but its name stays reserved
    let newId: string | null = null;

    try {
      // The server refuses to hand it out silently.
      const refused = await request.post('/api/qr', {
        data: { name: qaName('sneaky'), qrType: 'url', payload: 'https://example.com/x', styleConfig: {}, isDynamic: true, slug },
      });
      expect(refused.status()).toBe(409);
      expect((await refused.json()).code).toBe('SLUG_DELETED');

      // The deleted code's printed QR now says it was removed.
      expect((await visit(baseURL, `/q/${slug}`)).body).toContain('does not exist or has been removed');

      // In the form: not an error, but a warning that has to be accepted in the confirmation.
      await page.goto('/qr/new');
      await page.getByLabel('Name', { exact: true }).fill(qaName('new-samsam'));
      await page.getByRole('textbox', { name: 'Website URL' }).fill('https://example.com/new');
      await page.getByRole('tab', { name: 'Dynamic QR' }).click();
      await page.getByRole('switch', { name: 'Make this dynamic' }).click();
      await slugField(page).fill(slug);
      await expect(page.getByText(/This was the link of a QR code that was deleted/)).toBeVisible();

      await page.getByRole('button', { name: 'Save QR code' }).click();
      await expect(page.getByRole('alertdialog')).toContainText('belonged to a deleted QR code');
      await page.getByRole('alertdialog').getByRole('button', { name: 'Save QR code' }).click();
      await expect(page).toHaveURL(/\/qr\/[0-9a-f-]{36}$/);
      newId = page.url().split('/').pop()!;

      // The name now belongs to the new code, and the old printed code reaches it.
      const saved = (await (await request.get(`/api/qr/${newId}`)).json()) as { shortCode: string };
      expect(saved.shortCode).toBe(slug);
      const scanned = await visit(baseURL, `/q/${slug}`);
      expect(scanned.status).toBe(302);
      expect(scanned.headers['location']).toBe('https://example.com/new');
    } finally {
      if (newId) await deleteQR(request, newId);
    }
  });
});

test.describe('Forwarding an old link with a 301', () => {
  test('forward a deleted code’s link to a live code from its page, follow it, then stop forwarding', async ({
    page,
    request,
    baseURL,
  }) => {
    const target = freshSlug('target');
    const oldSlug = freshSlug('samsam-old');
    const live = await createQR(request, {
      name: qaName('live-memorial'),
      isDynamic: true,
      slug: target,
      payload: 'https://example.com/memorial',
    });
    const dead = await createQR(request, { name: qaName('dead-samsam'), isDynamic: true, slug: oldSlug, payload: 'https://example.com/dead' });
    await deleteQR(request, dead.id);

    try {
      await page.goto(`/qr/${live.id}`);
      await page.getByRole('tab', { name: 'Dynamic QR' }).click();
      const panel = page.getByTestId('forward-links-qr');
      await expect(panel).toContainText('Old links that forward here');

      // A link that a live code uses cannot be forwarded.
      await forwardField(page).fill(target);
      await expect(panel.getByText(/already taken/)).toBeVisible();
      await expect(panel.getByRole('button', { name: 'Forward this link here' })).toBeDisabled();

      // The deleted code's link can, after a confirmation that spells out the consequence.
      await forwardField(page).fill(oldSlug);
      await expect(panel.getByText(/This was the link of a QR code that was deleted/)).toBeVisible();
      await panel.getByRole('button', { name: 'Forward this link here' }).click();
      await expect(page.getByRole('alertdialog')).toContainText('permanent (301) redirect');
      await expect(page.getByRole('alertdialog')).toContainText('old printed code');
      await page.getByRole('alertdialog').getByRole('button', { name: 'Forward link' }).click();
      await expect(page.getByText(/now forwards here/)).toBeVisible();
      await expect(panel.getByRole('list', { name: 'Forwarded links' })).toContainText(oldSlug);

      // The old link is a real 301 to the live code's link, cached for a day at most.
      const before = await scanCount(page, live.id);
      const forwarded = await visit(baseURL, `/q/${oldSlug}`);
      expect(forwarded.status).toBe(301);
      expect(forwarded.headers['location']).toMatch(new RegExp(`/q/${target}$`));
      expect(forwarded.headers['cache-control']).toBe('public, max-age=86400');
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(await scanCount(page, live.id)).toBe(before); // the redirect itself is not a scan

      // Following it lands on the live code, which counts the scan.
      const landed = await visit(baseURL, new URL(forwarded.headers['location']).pathname);
      expect(landed.status).toBe(302);
      expect(landed.headers['location']).toBe('https://example.com/memorial');
      await expect.poll(() => scanCount(page, live.id), { timeout: 15_000 }).toBe(before + 1);

      // Rename the live code: the forward follows it, with no chain of redirects.
      const renamed = freshSlug('target2');
      expect((await request.put(`/api/qr/${live.id}`, { data: { isDynamic: true, slug: renamed } })).status()).toBe(200);
      expect((await visit(baseURL, `/q/${oldSlug}`)).headers['location']).toMatch(new RegExp(`/q/${renamed}$`));

      // Stop forwarding it: asks first, and the link stops working.
      await page.reload();
      await page.getByRole('tab', { name: 'Dynamic QR' }).click();
      await page.getByRole('button', { name: `Stop forwarding ${oldSlug}` }).click();
      await expect(page.getByRole('alertdialog')).toContainText('will stop working');
      await page.getByRole('alertdialog').getByRole('button', { name: 'Stop forwarding' }).click();
      await expect(page.getByText(/no longer forwards here/)).toBeVisible();
      const gone = await visit(baseURL, `/q/${oldSlug}`);
      expect(gone.status).toBe(404);
      expect(gone.headers['location']).toBeUndefined();
    } finally {
      await deleteQR(request, live.id);
    }
  });

  test('a forward to a code that was deleted shows "removed", never a redirect', async ({ request, baseURL }) => {
    const target = freshSlug('tgt');
    const oldSlug = freshSlug('fwd');
    const live = await createQR(request, { name: qaName('soon-gone'), isDynamic: true, slug: target });
    const added = await request.post(`/api/qr/${live.id}/forwards`, { data: { slug: oldSlug } });
    expect(added.status()).toBe(201);

    await deleteQR(request, live.id);

    const response = await visit(baseURL, `/q/${oldSlug}`);
    expect(response.status).toBe(404);
    expect(response.headers['location']).toBeUndefined();
  });

  test('the forwarding endpoints refuse bad requests', async ({ request, baseURL }) => {
    const live = await createQR(request, { name: qaName('guard'), isDynamic: true, slug: freshSlug('guard') });
    const staticQr = await createQR(request, { name: qaName('static'), payload: 'https://example.com/s' });
    try {
      const forwards = `/api/qr/${live.id}/forwards`;
      expect((await request.post(forwards, { data: { slug: 'ab' } })).status()).toBe(400);
      expect((await request.post(forwards, { data: { slug: '   ' } })).status()).toBe(400);
      // A static code has no link to forward to.
      const noLink = await request.post(`/api/qr/${staticQr.id}/forwards`, { data: { slug: freshSlug('x') } });
      expect(noLink.status()).toBe(400);
      expect((await noLink.json()).code).toBe('NO_LINK');
      // Cannot stop a forward that is not there.
      expect((await request.delete(`${forwards}?code=never-forwarded`)).status()).toBe(404);

      // Signed-out visitors cannot use any of it.
      const anon = await playwrightRequest.newContext({ baseURL, storageState: EMPTY_STATE });
      expect((await anon.get(forwards)).status()).toBe(401);
      expect((await anon.post(forwards, { data: { slug: freshSlug('anon') } })).status()).toBe(401);
      expect((await anon.delete(`${forwards}?code=x`)).status()).toBe(401);
      await anon.dispose();
    } finally {
      await deleteQR(request, live.id);
      await deleteQR(request, staticQr.id);
    }
  });
});

test.describe('Forwarding an old link to a page', () => {
  test('a page gets a 308 forward from its publish dialog, which opens the page, and can be removed', async ({
    page,
    request,
    baseURL,
  }) => {
    const slug = freshSlug('page');
    const oldSlug = freshSlug('old-page');
    const created = await createPage(request, { name: qaName('fwd-page') });
    expect((await request.post(`/api/pages/${created.id}/publish`, { data: { expiresAt: null, slug } })).status()).toBe(200);

    try {
      await page.goto(`/pages/${created.id}`);
      // Already published, so the toolbar button reads "Published".
      await page.getByRole('button', { name: 'Published', exact: true }).click();
      const panel = page.getByTestId('forward-links-page');
      await forwardField(page).fill(oldSlug);
      await expect(page.getByText('Available', { exact: true })).toBeVisible();
      await panel.getByRole('button', { name: 'Forward this link here' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Forward link' }).click();
      await expect(page.getByText(/now forwards here/)).toBeVisible();

      // A permanent redirect to the page's current address, and following it opens the page.
      const forwarded = await visit(baseURL, `/p/${oldSlug}`);
      expect([301, 308]).toContain(forwarded.status);
      expect(forwarded.headers['location']).toMatch(new RegExp(`/p/${slug}$`));
      const anon = await playwrightRequest.newContext({ baseURL, storageState: EMPTY_STATE });
      const opened = await anon.get(`/p/${oldSlug}`);
      await anon.dispose();
      expect(opened.status()).toBe(200);
      expect(opened.url()).toMatch(new RegExp(`/p/${slug}$`));

      // Remove it: the link stops working.
      await panel.getByRole('button', { name: `Stop forwarding ${oldSlug}` }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Stop forwarding' }).click();
      await expect(page.getByText(/no longer forwards here/)).toBeVisible();
      expect((await visit(baseURL, `/p/${oldSlug}`)).status).toBe(404);
    } finally {
      await deletePage(request, created.id);
    }
  });

  test('a page that was never published has nothing to forward to', async ({ request }) => {
    const created = await createPage(request, { name: qaName('unpublished') });
    try {
      const response = await request.post(`/api/pages/${created.id}/forwards`, { data: { slug: freshSlug('x') } });

      expect(response.status()).toBe(400);
      expect((await response.json()).code).toBe('NO_LINK');
    } finally {
      await deletePage(request, created.id);
    }
  });
});
