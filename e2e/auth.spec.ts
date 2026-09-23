import { test, expect } from '@playwright/test';

import { checkA11y } from './helpers/a11y';
import { CODES, EMPTY_STATE, PASSWORD, USERS } from './helpers/users';

test.describe('Authentication', () => {
  test.use({ storageState: EMPTY_STATE });

  test('signs in and lands on the dashboard @mobile', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(USERS.editor.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });

  test('rejects a wrong password and stays on the login page', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(USERS.editor.email);
    await page.getByLabel('Password', { exact: true }).fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Invalid email or password.')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('protected pages send you to login and bring you back afterwards', async ({ page }) => {
    await page.goto('/qr');
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fqr/);

    await page.getByLabel('Email').fill(USERS.editor.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/qr');
  });

  for (const path of ['/', '/qr', '/qr/new', '/templates', '/pages', '/pages/new', '/analytics', '/media', '/settings', '/activity', '/qr/batch', '/qr/compare']) {
    test(`${path} requires login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  for (const target of ['https://evil.example/phish', '//evil.example', '/\\evil.example', 'javascript:alert(1)']) {
    test(`ignores an off-site redirectTo (${target})`, async ({ page }) => {
      const offSite: string[] = [];
      await page.route('**/*', (route) => {
        if (new URL(route.request().url()).hostname === 'evil.example') {
          offSite.push(route.request().url());
          return route.abort();
        }
        return route.continue();
      });

      await page.goto(`/login?redirectTo=${encodeURIComponent(target)}`);
      await page.getByLabel('Email').fill(USERS.editor.email);
      await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
      await page.getByRole('button', { name: 'Sign in' }).click();

      // Falls back to the dashboard and never tries to leave the site.
      await expect(page).toHaveURL('/');
      expect(offSite).toEqual([]);
    });
  }

  test('the login page has no accessibility violations @mobile', async ({ page }) => {
    await page.goto('/login');
    await checkA11y(page, 'login');
  });

  test('forgot-password page loads', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByLabel('Email')).toBeVisible();
  });
});

test.describe('Public routes need no login', () => {
  test.use({ storageState: EMPTY_STATE });

  test('a dynamic QR redirects to its target', async ({ request }) => {
    const response = await request.get(`/q/${CODES.activeA}`, { maxRedirects: 0 });

    expect(response.status()).toBe(302);
    expect(response.headers()['location']).toBe('https://example.com/a');
  });

  test('the redirect keeps query strings and fragments intact', async ({ request }) => {
    const response = await request.get(`/q/${CODES.activeB}`, { maxRedirects: 0 });

    expect(response.status()).toBe(302);
    expect(response.headers()['location']).toBe('https://example.com/b?x=1&y=2#frag');
  });

  test('a published page renders without login', async ({ page }) => {
    const response = await page.goto(`/p/${CODES.pageLive}`);

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'In Loving Memory' })).toBeVisible();
    await expect(page).not.toHaveURL(/login/);
  });
});

test.describe('Sign out', () => {
  test.use({ storageState: EMPTY_STATE });

  test('signs out after confirmation and locks the dashboard again @mobile', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(USERS.signout.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/');

    await page.getByRole('button', { name: /^QS$/ }).click();
    await page.getByRole('menuitem', { name: /Sign out|Log out/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: /Sign out|Log out/ }).click();

    await expect(page).toHaveURL(/\/login/);
    await page.goto('/qr');
    await expect(page).toHaveURL(/\/login/);
  });
});
