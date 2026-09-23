import { test, expect, type Page } from '@playwright/test';

import { CODES, EMPTY_STATE } from './helpers/users';

const BREAKPOINTS = [
  { name: 'mobile 375', width: 375, height: 812 },
  { name: 'tablet 768', width: 768, height: 1024 },
  { name: 'desktop 1280', width: 1280, height: 800 },
  { name: 'wide 1920', width: 1920, height: 1080 },
];

const PAGES = ['/', '/qr', '/qr/new', '/qr/batch', '/qr/compare', '/templates', '/pages', '/pages/new', '/media', '/analytics', '/activity', '/settings'];

async function noHorizontalOverflow(page: Page): Promise<{ scrollWidth: number; innerWidth: number }> {
  return page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
}

test.describe('No horizontal page scrolling at any breakpoint', () => {
  for (const size of BREAKPOINTS) {
    for (const path of PAGES) {
      test(`${path} at ${size.name}`, async ({ page }) => {
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.goto(path);
        await page.waitForLoadState('networkidle');

        const { scrollWidth, innerWidth } = await noHorizontalOverflow(page);
        expect(scrollWidth, `${path} is ${scrollWidth}px wide in a ${innerWidth}px window`).toBeLessThanOrEqual(innerWidth + 1);
      });
    }
  }
});

test.describe('Layout on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the sidebar becomes a menu button that opens a drawer @mobile', async ({ page }) => {
    await page.goto('/qr');

    await expect(page.getByRole('navigation').first()).toBeHidden();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('dialog').getByRole('link', { name: 'QR Codes' })).toBeVisible();

    await page.getByRole('dialog').getByRole('link', { name: 'Templates' }).click();
    await expect(page).toHaveURL('/templates');
  });

  test('the designer stacks the form above the preview @mobile', async ({ page }) => {
    await page.goto('/qr/new');
    await page.getByRole('textbox', { name: 'Website URL' }).pressSequentially('example.com');

    const form = await page.getByRole('textbox', { name: 'Website URL' }).boundingBox();
    const preview = await page.getByTestId('qr-preview-canvas').locator('canvas, svg').first().boundingBox();

    expect(preview!.y).toBeGreaterThan(form!.y);
    expect(preview!.width).toBeGreaterThan(100);
    expect(preview!.x + preview!.width).toBeLessThanOrEqual(375 + 1);
  });

  test('tables scroll inside their own box instead of cutting content off @mobile', async ({ page }) => {
    await page.goto('/qr');
    const table = page.locator('[data-slot="table-container"], .overflow-x-auto').first();

    await expect(table).toBeVisible();
    const { scrollWidth, innerWidth } = await noHorizontalOverflow(page);
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 1);
  });

  test('analytics charts fit the screen @mobile', async ({ page }) => {
    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');

    for (const chart of await page.locator('.recharts-responsive-container').all()) {
      const box = await chart.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(375 + 1);
    }
  });

  test('the page editor says desktop is better on a phone (or at least loads)', async ({ page, request }) => {
    const list = (await (await request.get('/api/pages')).json()) as { items: { id: string; name: string }[] };
    const seeded = list.items.find((item) => item.name === '[QA] Blank draft')!;

    const response = await page.goto(`/pages/${seeded.id}`);

    expect(response?.status()).toBe(200);
  });
});

test.describe('Public pages on a phone', () => {
  test.use({ storageState: EMPTY_STATE, viewport: { width: 375, height: 812 } });

  test('a published page fits the screen with readable text @mobile', async ({ page }) => {
    await page.goto(`/p/${CODES.pageLive}`);

    const { scrollWidth, innerWidth } = await noHorizontalOverflow(page);
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 1);
    const heading = await page.getByRole('heading', { name: 'In Loving Memory' }).boundingBox();
    expect(heading!.x).toBeGreaterThanOrEqual(0);
    expect(heading!.x + heading!.width).toBeLessThanOrEqual(375 + 1);
    const fontSize = await page.locator('p').first().evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(14);
  });

  test('the expired message fits the screen @mobile', async ({ page }) => {
    await page.goto(`/p/${CODES.pageExpired}`);

    const { scrollWidth, innerWidth } = await noHorizontalOverflow(page);
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 1);
    await expect(page.getByText('This page has expired')).toBeVisible();
  });

  test('login fits the screen @mobile', async ({ page }) => {
    await page.goto('/login');

    const { scrollWidth, innerWidth } = await noHorizontalOverflow(page);
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 1);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });
});

test.describe('Exported HTML pages are responsive on their own', () => {
  test('the exported file has a viewport tag and no fixed-width layout', async ({ page }) => {
    await page.goto('/pages');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByLabel('Export [QA] Memorial live as HTML').click()]);
    const html = (await import('node:fs')).readFileSync((await download.path())!, 'utf8');

    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0">');

    await page.setViewportSize({ width: 375, height: 800 });
    await page.setContent(html);
    const { scrollWidth, innerWidth } = await noHorizontalOverflow(page);
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 1);
  });
});
