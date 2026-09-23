import { test, expect, request as playwrightRequest } from '@playwright/test';

import { createQR, deleteQR, qaName } from './helpers/api';
import { CODES } from './helpers/users';

/** A visitor with no session, like someone scanning a printed code. */
async function scan(baseURL: string | undefined, shortCode: string) {
  const anon = await playwrightRequest.newContext({ baseURL });
  try {
    const response = await anon.get(`/q/${shortCode}`, { maxRedirects: 0 });
    // Read everything now: the response is unusable once its context is disposed.
    const status = response.status();
    const headers = response.headers();
    const body = await response.text();
    return { status: () => status, headers: () => headers, text: async () => body };
  } finally {
    await anon.dispose();
  }
}

/** Scan logging is fire-and-forget; wait for the counter to settle. */
async function waitForScanCount(
  request: import('@playwright/test').APIRequestContext,
  id: string,
  expected: number,
): Promise<void> {
  await expect
    .poll(async () => ((await (await request.get(`/api/qr/${id}`)).json()) as { scanCount: number }).scanCount, {
      timeout: 15_000,
    })
    .toBe(expected);
}

/** Saves an edited QR through the confirm dialog and waits until the server has accepted it. */
async function saveChanges(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'Save changes' }).click();
  const saved = page.waitForResponse((r) => /\/api\/qr\/[0-9a-f-]{36}$/.test(r.url()) && r.request().method() === 'PUT');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Save changes' }).click();
  expect((await saved).status()).toBe(200);
}

test.describe('Dynamic QR lifecycle (through the UI)', () => {
  test('create, scan, repoint, pause and resume', async ({ page, request, baseURL }) => {
    const name = qaName('lifecycle');

    // --- create
    await page.goto('/qr/new');
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByRole('textbox', { name: 'Website URL' }).fill('https://example.com/first');
    await page.getByRole('switch', { name: 'Make this dynamic' }).click();
    await expect(page.getByText('A short link will be generated the first time you save.')).toBeVisible();

    await page.getByRole('button', { name: 'Save QR code' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Save QR code' }).click();

    // Stays with the QR (moves to its own edit page) and shows the short link.
    await expect(page).toHaveURL(/\/qr\/[0-9a-f-]{36}$/);
    const id = page.url().split('/').pop()!;
    await expect(page.getByText(/\/q\/[a-z0-9]{6}/)).toBeVisible();

    try {
      const saved = (await (await request.get(`/api/qr/${id}`)).json()) as { shortCode: string; isDynamic: boolean; targetUrl: string };
      expect(saved.isDynamic).toBe(true);
      expect(saved.shortCode).toMatch(/^[2-9a-hj-km-np-z]{6}$/);

      // --- scan
      let response = await scan(baseURL, saved.shortCode);
      expect(response.status()).toBe(302);
      expect(response.headers()['location']).toBe('https://example.com/first');

      // --- change the target; the same printed code follows it
      await page.getByRole('textbox', { name: 'Website URL' }).fill('https://example.com/second');
      await saveChanges(page);

      response = await scan(baseURL, saved.shortCode);
      expect(response.headers()['location']).toBe('https://example.com/second');

      // --- pause
      await page.getByRole('switch', { name: 'Paused' }).click();
      await saveChanges(page);

      response = await scan(baseURL, saved.shortCode);
      expect(response.status()).toBe(410);
      expect(await response.text()).toContain('Paused');

      // --- resume
      await page.getByRole('switch', { name: 'Paused' }).click();
      await saveChanges(page);

      response = await scan(baseURL, saved.shortCode);
      expect(response.status()).toBe(302);

      // Only the two live scans counted; the paused one did not.
      await waitForScanCount(request, id, 3);
    } finally {
      await deleteQR(request, id);
    }
  });
});

test.describe('Redirect gates (seeded codes)', () => {
  test('a paused code answers 410 "Paused"', async ({ baseURL }) => {
    const response = await scan(baseURL, CODES.paused);

    expect(response.status()).toBe(410);
    expect(await response.text()).toContain('Paused');
  });

  test('an expired code answers 410 "Expired"', async ({ baseURL }) => {
    const response = await scan(baseURL, CODES.expired);

    expect(response.status()).toBe(410);
    expect(await response.text()).toContain('Expired');
  });

  test('an unknown code answers 404', async ({ baseURL }) => {
    const response = await scan(baseURL, 'zzzzzz');

    expect(response.status()).toBe(404);
    expect(await response.text()).toContain('Not Found');
  });

  test('error pages never leak the destination or the internals', async ({ baseURL }) => {
    const body = await (await scan(baseURL, CODES.paused)).text();

    expect(body).not.toContain('example.com');
    expect(body).not.toMatch(/stack|drizzle|postgres|supabase/i);
  });
});

test.describe('Redirect behaviour (fresh codes)', () => {
  test('a scan limit of 2 allows exactly 2 scans, then answers 410', async ({ request, baseURL }) => {
    const qr = await createQR(request, { isDynamic: true, payload: 'https://example.com/limited', scanLimit: 2 });
    try {
      expect((await scan(baseURL, qr.shortCode!)).status()).toBe(302);
      expect((await scan(baseURL, qr.shortCode!)).status()).toBe(302);

      const third = await scan(baseURL, qr.shortCode!);
      expect(third.status()).toBe(410);
      expect(await third.text()).toContain('Scan Limit');
      await waitForScanCount(request, qr.id, 2);
    } finally {
      await deleteQR(request, qr.id);
    }
  });

  test('the scan limit holds under simultaneous scans', async ({ request, baseURL }) => {
    const qr = await createQR(request, { isDynamic: true, payload: 'https://example.com/race', scanLimit: 3 });
    try {
      const results = await Promise.all(Array.from({ length: 10 }, () => scan(baseURL, qr.shortCode!)));
      const statuses = results.map((r) => r.status());

      expect(statuses.filter((s) => s === 302)).toHaveLength(3);
      expect(statuses.filter((s) => s === 410)).toHaveLength(7);
      await waitForScanCount(request, qr.id, 3);
    } finally {
      await deleteQR(request, qr.id);
    }
  });

  test('rapid repeat scans are all counted (no de-duplication)', async ({ request, baseURL }) => {
    const qr = await createQR(request, { isDynamic: true, payload: 'https://example.com/rapid' });
    try {
      for (let i = 0; i < 5; i++) await scan(baseURL, qr.shortCode!);

      await waitForScanCount(request, qr.id, 5);
      const analytics = (await (await request.get(`/api/analytics?qrId=${qr.id}`)).json()) as { totalScans: number };
      await expect.poll(async () => ((await (await request.get(`/api/analytics?qrId=${qr.id}`)).json()) as { totalScans: number }).totalScans, { timeout: 15_000 }).toBe(5);
      expect(analytics.totalScans).toBeGreaterThanOrEqual(0);
    } finally {
      await deleteQR(request, qr.id);
    }
  });

  test('three simultaneous scans all redirect and all count', async ({ request, baseURL }) => {
    const qr = await createQR(request, { isDynamic: true, payload: 'https://example.com/tabs' });
    try {
      const results = await Promise.all([1, 2, 3].map(() => scan(baseURL, qr.shortCode!)));

      expect(results.map((r) => r.status())).toEqual([302, 302, 302]);
      await waitForScanCount(request, qr.id, 3);
    } finally {
      await deleteQR(request, qr.id);
    }
  });

  test('a very long target URL (about 1,900 characters) redirects intact', async ({ request, baseURL }) => {
    const target = `https://example.com/long?q=${'a'.repeat(1880)}`;
    const qr = await createQR(request, { isDynamic: true, payload: target });
    try {
      const response = await scan(baseURL, qr.shortCode!);

      expect(response.status()).toBe(302);
      expect(response.headers()['location']).toBe(target);
    } finally {
      await deleteQR(request, qr.id);
    }
  });

  test('targets keep query strings, fragments and encoded characters', async ({ request, baseURL }) => {
    const target = 'https://example.com/page?foo=bar&baz=qux&name=Jos%C3%A9%20Rizal#section-2';
    const qr = await createQR(request, { isDynamic: true, payload: target });
    try {
      expect((await scan(baseURL, qr.shortCode!)).headers()['location']).toBe(target);
    } finally {
      await deleteQR(request, qr.id);
    }
  });

  test('a mailto: or tel: target redirects to that scheme', async ({ request, baseURL }) => {
    const mail = await createQR(request, { isDynamic: true, qrType: 'email', payload: 'mailto:hello@example.com' });
    const tel = await createQR(request, { isDynamic: true, qrType: 'phone', payload: 'tel:+15550102000' });
    try {
      expect((await scan(baseURL, mail.shortCode!)).headers()['location']).toBe('mailto:hello@example.com');
      expect((await scan(baseURL, tel.shortCode!)).headers()['location']).toBe('tel:+15550102000');
    } finally {
      await deleteQR(request, mail.id);
      await deleteQR(request, tel.id);
    }
  });

  test('a deleted code stops redirecting', async ({ request, baseURL }) => {
    const qr = await createQR(request, { isDynamic: true, payload: 'https://example.com/gone' });
    expect((await scan(baseURL, qr.shortCode!)).status()).toBe(302);

    await deleteQR(request, qr.id);

    expect((await scan(baseURL, qr.shortCode!)).status()).toBe(404);
  });

  test('a code with an expiry in the future still redirects', async ({ request, baseURL }) => {
    const qr = await createQR(request, {
      isDynamic: true,
      payload: 'https://example.com/soon',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    try {
      expect((await scan(baseURL, qr.shortCode!)).status()).toBe(302);
    } finally {
      await deleteQR(request, qr.id);
    }
  });
});

test.describe('Scan data privacy', () => {
  test('analytics never expose IP addresses', async ({ request }) => {
    const summary = await (await request.get('/api/analytics')).text();

    expect(summary).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    expect(summary).not.toContain('ipHash');
  });
});
