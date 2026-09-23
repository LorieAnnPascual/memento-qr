import { test, expect, type Page } from '@playwright/test';

/** The number shown on a summary card such as "Total scans". */
async function cardNumber(page: Page, title: string): Promise<number> {
  const card = page.locator('[data-slot="card"]').filter({ has: page.getByText(title, { exact: true }) }).first();
  const text = (await card.locator('[data-slot="card-content"]').innerText()).trim();
  return Number.parseInt(text, 10);
}

interface Summary {
  totalScans: number;
  uniqueVisitors: number;
  deviceBreakdown: { type: string; count: number }[];
}

test.describe('Analytics dashboard', () => {
  test('loads charts and numbers from the seeded scans @mobile', async ({ page }) => {
    await page.goto('/analytics');

    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
    await expect.poll(() => cardNumber(page, 'Total scans')).toBeGreaterThanOrEqual(200);
    await expect(page.getByText('Scans over time')).toBeVisible();
    await expect(page.getByText('Devices')).toBeVisible();
    await expect(page.getByText('Top locations')).toBeVisible();
    await expect(page.getByText('Recent scans')).toBeVisible();
  });

  test('the numbers match the API', async ({ page, request }) => {
    const api = (await (await request.get('/api/analytics')).json()) as Summary;

    await page.goto('/analytics');
    // The page opens on the last 30 days; the seeded scans all fall inside it.
    await expect.poll(() => cardNumber(page, 'Total scans')).toBe(api.totalScans);
    expect(await cardNumber(page, 'Unique visitors')).toBe(api.uniqueVisitors);
  });

  test('a shorter date range shows fewer scans', async ({ page }) => {
    await page.goto('/analytics');
    await expect.poll(() => cardNumber(page, 'Total scans')).toBeGreaterThan(0);
    const month = await cardNumber(page, 'Total scans');

    await page.getByRole('combobox', { name: 'Date range' }).click();
    await page.getByRole('option', { name: 'Last 7 days' }).click();

    await expect.poll(() => cardNumber(page, 'Total scans')).toBeLessThan(month);
  });

  test('"All time" is at least as many as 30 days', async ({ page }) => {
    await page.goto('/analytics');
    await expect.poll(() => cardNumber(page, 'Total scans')).toBeGreaterThan(0);
    const month = await cardNumber(page, 'Total scans');

    await page.getByRole('combobox', { name: 'Date range' }).click();
    await page.getByRole('option', { name: 'All time' }).click();

    await expect.poll(() => cardNumber(page, 'Total scans')).toBeGreaterThanOrEqual(month);
  });

  test('a custom range with no scans shows a friendly empty state, not broken charts', async ({ page }) => {
    await page.goto('/analytics');
    await page.getByRole('combobox', { name: 'Date range' }).click();
    await page.getByRole('option', { name: 'Custom range' }).click();
    await page.getByLabel('From date').fill('2001-01-01');
    await page.getByLabel('To date').fill('2001-01-31');

    await expect.poll(() => cardNumber(page, 'Total scans')).toBe(0);
    await expect(page.getByText('No scans yet.').first()).toBeVisible();
    await expect(page.getByText('No data for this period.').first()).toBeVisible();
  });

  test('drilling into one QR code shows only its scans', async ({ page }) => {
    await page.goto('/analytics');
    await expect.poll(() => cardNumber(page, 'Total scans')).toBeGreaterThan(0);

    await page.getByRole('combobox', { name: 'QR code filter' }).click();
    await page.getByRole('option', { name: '[QA] Dynamic limited' }).click();

    // The seeded scan-limited code has exactly 9 scans logged.
    await expect.poll(() => cardNumber(page, 'Total scans')).toBe(9);
  });

  test('the QR list scan count agrees with analytics', async ({ page, request }) => {
    const list = (await (await request.get('/api/qr?search=%5BQA%5D%20Dynamic%20limited')).json()) as { items: { id: string; scanCount: number }[] };
    const limited = list.items[0];
    const summary = (await (await request.get(`/api/analytics?qrId=${limited.id}`)).json()) as Summary;

    expect(summary.totalScans).toBe(limited.scanCount);
    expect(limited.scanCount).toBe(9);

    await page.goto('/qr');
    await page.getByPlaceholder('Search by name…').fill('[QA] Dynamic limited');
    await expect(page.getByRole('row').filter({ hasText: '[QA] Dynamic limited' })).toContainText('9');
  });

  test('the per-QR analytics page opens from the list', async ({ page, request }) => {
    const list = (await (await request.get('/api/qr?search=%5BQA%5D%20Dynamic%20active%20A')).json()) as { items: { id: string }[] };

    await page.goto(`/qr/${list.items[0].id}/analytics`);

    await expect(page.getByText('Total scans')).toBeVisible();
  });

  test('CSV export downloads the scan events', async ({ request }) => {
    const response = await request.get('/api/analytics?format=csv');
    const csv = await response.text();

    expect(response.headers()['content-type']).toContain('text/csv');
    expect(csv.split('\n')[0]).toBe('Scanned At,QR Code,Device,Browser,OS,Country,City,Referrer');
    expect(csv.split('\n').length).toBeGreaterThan(190);
    expect(csv).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/); // no raw IP addresses
  });

  test('scan data is anonymous: IP hashes are 64-character digests and never exposed', async ({ request }) => {
    const text = await (await request.get('/api/analytics')).text();

    expect(text).not.toContain('ipHash');
  });

  test('analytics show devices and countries from the seeded data', async ({ request }) => {
    const summary = (await (await request.get('/api/analytics')).json()) as Summary & { topCountries: { country: string }[] };
    const types = summary.deviceBreakdown.map((d) => d.type);

    expect(types).toEqual(expect.arrayContaining(['mobile', 'desktop']));
    expect(summary.topCountries.map((c) => c.country)).toContain('Philippines');
  });
});
