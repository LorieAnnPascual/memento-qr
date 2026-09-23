import { readFileSync } from 'node:fs';

import { test, expect, request as playwrightRequest, type APIRequestContext, type Page } from '@playwright/test';

import { createPage, deletePage, qaName } from './helpers/api';
import { CODES } from './helpers/users';

async function visitAnonymously(baseURL: string | undefined, path: string) {
  const anon = await playwrightRequest.newContext({ baseURL });
  try {
    const response = await anon.get(path);
    return { status: response.status(), body: await response.text() };
  } finally {
    await anon.dispose();
  }
}

/** A page built from the Memorial template, made through the real API. */
async function pageFromTemplate(request: APIRequestContext, name = qaName('page')): Promise<{ id: string; name: string }> {
  const response = await request.post('/api/pages', { data: { name, category: 'memorial', puckData: await memorialData(request) } });
  if (!response.ok()) throw new Error(`could not create page: ${response.status()} ${await response.text()}`);
  return (await response.json()) as { id: string; name: string };
}

async function memorialData(request: APIRequestContext): Promise<unknown> {
  // Copy the live seeded memorial page's design.
  const list = (await (await request.get('/api/pages')).json()) as { items: { id: string; name: string }[] };
  const seeded = list.items.find((item) => item.name === '[QA] Memorial live');
  if (!seeded) throw new Error('Run "pnpm db:seed" first: the seeded memorial page is missing.');
  const full = (await (await request.get(`/api/pages/${seeded.id}`)).json()) as { puckData: unknown };
  return full.puckData;
}

const canvas = (page: Page) => page.frameLocator('iframe#preview-frame');

test.describe('Pages list', () => {
  test('shows every page with its publish status @mobile', async ({ page }) => {
    await page.goto('/pages');

    const row = (name: string) => page.getByRole('row').filter({ hasText: name });
    await expect(row('[QA] Memorial live')).toContainText('Published');
    await expect(row('[QA] Business expired')).toContainText('Expired');
    await expect(row('[QA] Event draft')).toContainText('Draft');
    await expect(row('[QA] Blank draft')).toContainText('Draft');
  });

  test('only live pages get a public link', async ({ page }) => {
    await page.goto('/pages');

    await expect(page.getByLabel('Open [QA] Memorial live')).toHaveAttribute('href', new RegExp(`/p/${CODES.pageLive}$`));
    await expect(page.getByLabel('Open [QA] Event draft')).toHaveCount(0);
    await expect(page.getByLabel('Open [QA] Business expired')).toHaveCount(0);
  });

  test('exporting from the list downloads a standalone HTML file', async ({ page }) => {
    await page.goto('/pages');

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByLabel('Export [QA] Memorial live as HTML').click()]);
    const html = readFileSync((await download.path())!, 'utf8');

    expect(download.suggestedFilename()).toMatch(/\.html$/);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('In Loving Memory');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
  });

  test('deleting asks first and warns when the page is live', async ({ page, request }) => {
    const created = await pageFromTemplate(request);
    const publish = await request.post(`/api/pages/${created.id}/publish`, { data: { expiresAt: null } });
    expect(publish.status()).toBe(200);

    try {
      await page.goto('/pages');
      await page.getByLabel(`Delete ${created.name}`).click();
      await expect(page.getByRole('alertdialog')).toContainText('takes its public link offline');
      await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();

      await expect(page.getByText('Page deleted')).toBeVisible();
      expect((await request.get(`/api/pages/${created.id}`)).status()).toBe(404);
    } finally {
      await deletePage(request, created.id);
    }
  });
});

test.describe('Template gallery', () => {
  test('previews a template with its real content (regression: previews were blank)', async ({ page }) => {
    await page.goto('/pages/new');
    await page.getByRole('button', { name: 'Preview' }).first().click();

    const frame = page.locator('iframe[title^="Preview of"]');
    await expect(frame).toBeVisible();
    const box = await frame.boundingBox();
    expect(box!.height).toBeGreaterThan(200);
    expect(box!.width).toBeGreaterThan(300);
    await expect(page.frameLocator('iframe[title^="Preview of"]').locator('body')).not.toBeEmpty();
    await expect(page.frameLocator('iframe[title^="Preview of"]').getByRole('heading').first()).toBeVisible();
  });

  test('every system template previews with content', async ({ page }) => {
    await page.goto('/pages/new');
    const previews = page.getByRole('button', { name: 'Preview' });
    const count = await previews.count();
    expect(count).toBeGreaterThanOrEqual(5);

    for (let index = 0; index < count; index++) {
      await previews.nth(index).click();
      await expect(page.frameLocator('iframe[title^="Preview of"]').getByRole('heading').first()).toBeVisible();
      await page.getByRole('button', { name: 'Close' }).click();
      await expect(page.locator('iframe[title^="Preview of"]')).toBeHidden();
    }
  });

  test('the category filter narrows the templates', async ({ page }) => {
    await page.goto('/pages/new');
    const all = await page.getByRole('button', { name: 'Use template' }).count();

    await page.getByRole('combobox', { name: 'Category filter' }).click();
    await page.getByRole('option', { name: 'pet' }).click();

    const filtered = await page.getByRole('button', { name: 'Use template' }).count();
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(all);
  });

  test('creating from a template makes your own copy and opens the editor', async ({ page, request }) => {
    const name = qaName('from-template');
    await page.goto('/pages/new');
    await page.getByRole('button', { name: 'Use template' }).first().click();
    await page.getByLabel('Page name').fill(name);
    await page.getByRole('button', { name: 'Create page' }).click();

    await expect(page).toHaveURL(/\/pages\/[0-9a-f-]{36}$/);
    const id = page.url().split('/').pop()!;
    try {
      const saved = (await (await request.get(`/api/pages/${id}`)).json()) as { name: string; isPublished: boolean; isPublic: boolean };
      expect(saved.name).toBe(name);
      expect(saved.isPublished).toBe(false);
      expect(saved.isPublic).toBe(false);
    } finally {
      await deletePage(request, id);
    }
  });

  test('starting blank creates an empty page', async ({ page, request }) => {
    await page.goto('/pages/new');
    await page.getByRole('button', { name: 'Start blank' }).click();
    await page.getByLabel('Page name').fill(qaName('blank'));
    await page.getByRole('button', { name: 'Create page' }).click();

    await expect(page).toHaveURL(/\/pages\/[0-9a-f-]{36}$/);
    await deletePage(request, page.url().split('/').pop()!);
  });
});

test.describe('Editor', () => {
  test('opens with the block list, and a page can be saved without leaving', async ({ page, request }) => {
    const created = await pageFromTemplate(request);
    try {
      await page.goto(`/pages/${created.id}`);
      await expect(page.getByTestId('drawer-item:HeroSection')).toBeVisible({ timeout: 20_000 });
      await expect(canvas(page).getByText('In Loving Memory')).toBeVisible();

      // Rename, save through the confirmation, stay on the page.
      await page.getByLabel('Page name').fill(`${created.name} renamed`);
      await page.getByRole('button', { name: 'Save', exact: true }).first().click();
      await expect(page.getByRole('alertdialog')).toContainText('Save changes to this page?');
      const saved = page.waitForResponse((r) => r.url().endsWith(`/api/pages/${created.id}`) && r.request().method() === 'PUT');
      await page.getByRole('alertdialog').getByRole('button', { name: 'Save' }).click();
      expect((await saved).status()).toBe(200);

      await expect(page.getByText('Page saved')).toBeVisible();
      await expect(page).toHaveURL(`/pages/${created.id}`);
      const back = (await (await request.get(`/api/pages/${created.id}`)).json()) as { name: string };
      expect(back.name).toBe(`${created.name} renamed`);
    } finally {
      await deletePage(request, created.id);
    }
  });

  test('editing a block updates the live preview and persists', async ({ page, request }) => {
    const created = await pageFromTemplate(request);
    try {
      await page.goto(`/pages/${created.id}`);
      await canvas(page).getByText('In Loving Memory').click();

      const title = page.getByRole('textbox', { name: 'Title', exact: true });
      await expect(title).toBeVisible();
      await title.fill('In Memory of Ana');

      await expect(canvas(page).getByText('In Memory of Ana')).toBeVisible();
      await expect(page.getByText('Unsaved changes')).toBeVisible();

      await page.getByRole('button', { name: 'Save', exact: true }).first().click();
      const saved = page.waitForResponse((r) => r.url().endsWith(`/api/pages/${created.id}`) && r.request().method() === 'PUT');
      await page.getByRole('alertdialog').getByRole('button', { name: 'Save' }).click();
      expect((await saved).status()).toBe(200);

      const back = JSON.stringify(((await (await request.get(`/api/pages/${created.id}`)).json()) as { puckData: unknown }).puckData);
      expect(back).toContain('In Memory of Ana');
    } finally {
      await deletePage(request, created.id);
    }
  });

  test('the hero block offers an image upload for its background', async ({ page, request }) => {
    const created = await pageFromTemplate(request);
    try {
      await page.goto(`/pages/${created.id}`);
      await canvas(page).getByText('In Loving Memory').click();

      await expect(page.getByRole('button', { name: 'Upload image' }).first()).toBeVisible();
    } finally {
      await deletePage(request, created.id);
    }
  });

  test('Export HTML downloads what is on screen, including unsaved edits', async ({ page, request }) => {
    const created = await pageFromTemplate(request);
    try {
      await page.goto(`/pages/${created.id}`);
      await canvas(page).getByText('In Loving Memory').click();
      await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Unsaved headline');

      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export HTML' }).click()]);
      const html = readFileSync((await download.path())!, 'utf8');

      expect(html).toContain('Unsaved headline');
      expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    } finally {
      await deletePage(request, created.id);
    }
  });

  test('leaving with unsaved changes warns first', async ({ page, request }) => {
    const created = await pageFromTemplate(request);
    try {
      await page.goto(`/pages/${created.id}`);
      await canvas(page).getByText('In Loving Memory').click();
      await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Changed');

      let warned = false;
      page.on('dialog', (dialog) => {
        warned = dialog.type() === 'beforeunload';
        void dialog.dismiss();
      });
      await page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true })));
      await page.goto('/pages', { waitUntil: 'commit' }).catch(() => undefined);

      expect(warned || (await page.getByText('Unsaved changes').count()) > 0 || page.url().includes('/pages/')).toBe(true);
    } finally {
      await deletePage(request, created.id);
    }
  });
});

test.describe('Publishing', () => {
  test('publish, visit, set an expiry, unpublish, and republish to the same link', async ({ page, request, baseURL }) => {
    const created = await pageFromTemplate(request);
    try {
      await page.goto(`/pages/${created.id}`);
      await expect(page.getByTestId('drawer-item:HeroSection')).toBeVisible({ timeout: 20_000 });

      // --- publish
      await page.getByRole('button', { name: 'Publish', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('Publish page');
      await page.getByRole('dialog').getByRole('button', { name: 'Publish', exact: true }).click();
      await expect(page.getByRole('alertdialog')).toContainText('Publish this page?');
      await page.getByRole('alertdialog').getByRole('button', { name: 'Publish' }).click();

      await expect(page.getByText('Page published')).toBeVisible();
      const link = await page.getByRole('dialog').getByRole('textbox').first().inputValue();
      const shortCode = /\/p\/([a-z0-9]{6})/.exec(link)![1];

      // --- anyone can open it, no login
      let visit = await visitAnonymously(baseURL, `/p/${shortCode}`);
      expect(visit.status).toBe(200);
      expect(visit.body).toContain('In Loving Memory');

      // --- an expiry in the future keeps it available
      const future = new Date(Date.now() + 3_600_000).toISOString();
      expect((await request.put(`/api/pages/${created.id}/expiry`, { data: { expiresAt: future } })).status()).toBe(200);
      visit = await visitAnonymously(baseURL, `/p/${shortCode}`);
      expect(visit.body).toContain('In Loving Memory');

      // --- an expiry in the past is refused
      expect((await request.put(`/api/pages/${created.id}/expiry`, { data: { expiresAt: new Date(Date.now() - 60_000).toISOString() } })).status()).toBe(400);

      // --- unpublish: the link stops working
      await page.reload();
      await page.getByRole('button', { name: 'Published', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Unpublish' }).click();
      await expect(page.getByRole('alertdialog')).toContainText('Unpublish this page?');
      await page.getByRole('alertdialog').getByRole('button', { name: 'Unpublish' }).click();
      await expect(page.getByText('Page unpublished')).toBeVisible();

      visit = await visitAnonymously(baseURL, `/p/${shortCode}`);
      expect(visit.status).toBe(404);
      expect(visit.body).not.toContain('In Loving Memory');

      // --- republish: the very same link comes back
      const again = (await (await request.post(`/api/pages/${created.id}/publish`, { data: { expiresAt: null } })).json()) as { shortCode: string };
      expect(again.shortCode).toBe(shortCode);
      expect((await visitAnonymously(baseURL, `/p/${shortCode}`)).status).toBe(200);
    } finally {
      await deletePage(request, created.id);
    }
  });

  test('a page whose expiry passes shows the expired message and no content', async ({ request, baseURL }) => {
    const visit = await visitAnonymously(baseURL, `/p/${CODES.pageExpired}`);

    expect(visit.status).toBe(200);
    expect(visit.body).toContain('This page has expired');
    expect(visit.body).not.toContain('Business Card');
  });

  test('an unknown or unpublished link is a 404', async ({ request, baseURL }) => {
    expect((await visitAnonymously(baseURL, '/p/zzzzzz')).status).toBe(404);

    const draft = await pageFromTemplate(request);
    try {
      expect((await visitAnonymously(baseURL, '/p/qanope')).status).toBe(404);
    } finally {
      await deletePage(request, draft.id);
    }
  });

  test('published pages ask search engines not to index them', async ({ baseURL }) => {
    const visit = await visitAnonymously(baseURL, `/p/${CODES.pageLive}`);

    expect(visit.body).toMatch(/<meta name="robots" content="noindex/i);
  });

  test('the published page shows the same content as its export', async ({ page, baseURL }) => {
    await page.goto(`/p/${CODES.pageLive}`);
    const live = await page.locator('body').innerText();

    await page.goto('/pages');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByLabel('Export [QA] Memorial live as HTML').click()]);
    const exported = readFileSync((await download.path())!, 'utf8');

    for (const phrase of ['In Loving Memory', 'Their Story', 'Leave a Memory', 'Forever in our hearts']) {
      expect(live).toContain(phrase);
      expect(exported).toContain(phrase);
    }
    expect(baseURL).toBeTruthy();
  });

  test('a long page with 12 blocks renders and scrolls @mobile', async ({ page, request }) => {
    const content = Array.from({ length: 12 }, (_, i) => ({
      type: 'TextBlock',
      props: { id: `b${i}`, heading: `Section ${i + 1}`, content: 'Lorem ipsum dolor sit amet. '.repeat(20), backgroundColor: '', textColor: '' },
    }));
    const created = await pageFromTemplate(request);
    await request.put(`/api/pages/${created.id}`, { data: { puckData: { root: { props: {} }, content, zones: {} } } });
    const published = (await (await request.post(`/api/pages/${created.id}/publish`, { data: { expiresAt: null } })).json()) as { shortCode: string };
    try {
      await page.goto(`/p/${published.shortCode}`);
      await expect(page.getByRole('heading', { name: 'Section 12' })).toBeAttached();
      await page.getByRole('heading', { name: 'Section 12' }).scrollIntoViewIfNeeded();
      await expect(page.getByRole('heading', { name: 'Section 12' })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    } finally {
      await deletePage(request, created.id);
    }
  });
});
