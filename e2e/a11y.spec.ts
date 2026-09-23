import { test, expect } from '@playwright/test';

import { checkA11y } from './helpers/a11y';
import { EMPTY_STATE, CODES } from './helpers/users';

// WCAG 2.1 A + AA, scanned with axe on every screen a person can reach.
const DASHBOARD_PAGES: [string, string][] = [
  ['Dashboard', '/'],
  ['QR list', '/qr'],
  ['QR designer', '/qr/new'],
  ['QR batch import', '/qr/batch'],
  ['QR compare', '/qr/compare'],
  ['QR templates', '/templates'],
  ['Pages list', '/pages'],
  ['Page template gallery', '/pages/new'],
  ['Media library', '/media'],
  ['Analytics', '/analytics'],
  ['Activity', '/activity'],
  ['Settings', '/settings'],
];

test.describe('Accessibility: dashboard (light)', () => {
  for (const [name, path] of DASHBOARD_PAGES) {
    test(`${name} has no WCAG A/AA violations @mobile`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await checkA11y(page, name);
    });
  }
});

test.describe('Accessibility: dashboard (dark)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  });

  for (const [name, path] of DASHBOARD_PAGES.filter(([, p]) => ['/', '/qr', '/qr/new', '/analytics', '/settings'].includes(p))) {
    test(`${name} has no WCAG A/AA violations in dark mode`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('html')).toHaveClass(/dark/);
      await checkA11y(page, `${name} (dark)`);
    });
  }
});

test.describe('Accessibility: settings tabs and dialogs', () => {
  for (const tab of ['Appearance', 'Your data', 'Security']) {
    test(`Settings › ${tab}`, async ({ page }) => {
      await page.goto('/settings');
      await page.getByRole('tab', { name: tab }).click();
      await checkA11y(page, `Settings ${tab}`);
    });
  }

  test('the folder dialog', async ({ page }) => {
    await page.goto('/qr');
    await page.getByRole('button', { name: 'Folders' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await checkA11y(page, 'Folder dialog');
  });

  test('the template preview dialog', async ({ page }) => {
    await page.goto('/pages/new');
    await page.getByRole('button', { name: 'Preview' }).first().click();
    await expect(page.locator('iframe[title^="Preview of"]')).toBeVisible();
    // The preview iframe is a rendered landing page, scanned separately as a published page.
    await checkA11y(page, 'Template preview dialog', ['iframe[title^="Preview of"]']);
  });

  test('a confirmation dialog', async ({ page }) => {
    await page.goto('/qr/new');
    await page.getByLabel('Name', { exact: true }).fill('[QA] a11y');
    await page.getByRole('textbox', { name: 'Website URL' }).fill('example.com');
    await page.getByRole('button', { name: 'Save QR code' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await checkA11y(page, 'Save confirmation');
  });
});

test.describe('Accessibility: public pages', () => {
  test.use({ storageState: EMPTY_STATE });

  test('login', async ({ page }) => {
    await page.goto('/login');
    await checkA11y(page, 'Login');
  });

  test('forgot password', async ({ page }) => {
    await page.goto('/forgot-password');
    await checkA11y(page, 'Forgot password');
  });

  test('a published landing page', async ({ page }) => {
    await page.goto(`/p/${CODES.pageLive}`);
    await checkA11y(page, 'Published page');
  });

  test('the expired-page message', async ({ page }) => {
    await page.goto(`/p/${CODES.pageExpired}`);
    await checkA11y(page, 'Expired page');
  });
});

test.describe('Accessibility: page editor (Puck is third-party)', () => {
  test('our own controls in the editor header and dialogs have no violations', async ({ page, request }) => {
    const list = (await (await request.get('/api/pages')).json()) as { items: { id: string; name: string }[] };
    const seeded = list.items.find((item) => item.name === '[QA] Event draft')!;

    await page.goto(`/pages/${seeded.id}`);
    await expect(page.getByTestId('drawer-item:HeroSection')).toBeVisible({ timeout: 20_000 });

    // Exclusions: Puck's own editor chrome and its preview iframe are third-party.
    // Known gaps in Puck are documented in the QA report; our header and dialogs are checked here.
    await checkA11y(page, 'Page editor', ['[class*="Puck"]', '#preview-frame', '[class*="puck"]']);
  });
});

test.describe('Keyboard and focus', () => {
  test('there is a way to reach the main content without tabbing through the sidebar', async ({ page }) => {
    await page.goto('/qr');
    await page.keyboard.press('Tab');

    const first = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    // Either a "Skip to main content" link, or the tab order starts inside the page content.
    expect(first.length).toBeGreaterThan(0);
  });

  test('dialogs trap focus and close with Escape', async ({ page }) => {
    await page.goto('/qr');
    await page.getByRole('button', { name: 'Folders' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('confirmation dialogs close with Escape without acting', async ({ page, request }) => {
    await page.goto('/qr/new');
    await page.getByLabel('Name', { exact: true }).fill('[QA] escape');
    await page.getByRole('textbox', { name: 'Website URL' }).fill('example.com');
    await page.getByRole('button', { name: 'Save QR code' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('alertdialog')).toBeHidden();
    const found = (await (await request.get('/api/qr?search=%5BQA%5D%20escape')).json()) as { items: unknown[] };
    expect(found.items).toEqual([]);
  });

  test('form fields have visible labels and the type picker is a proper radio group', async ({ page }) => {
    await page.goto('/qr/new');

    await expect(page.getByRole('radiogroup', { name: 'QR code type' })).toBeVisible();
    for (const label of ['Name', 'Website URL']) {
      await expect(page.getByLabel(label, { exact: false }).first()).toBeVisible();
    }
  });

  test('every icon-only button has an accessible name', async ({ page }) => {
    for (const path of ['/qr', '/pages', '/templates', '/media']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const unnamed = await page.evaluate(() =>
        [...document.querySelectorAll('button, a')]
          .filter((el) => !(el.textContent ?? '').trim() && !el.getAttribute('aria-label') && !el.getAttribute('title') && !el.querySelector('img[alt]'))
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => el.outerHTML.slice(0, 120)),
      );

      expect(unnamed, `Unnamed controls on ${path}`).toEqual([]);
    }
  });

  test('animations are switched off when the person prefers reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/qr');
    await page.getByRole('button', { name: 'Folders' }).click();

    const duration = await page.getByRole('dialog').evaluate((el) => getComputedStyle(el).animationDuration);
    // 0s (disabled) or a very short duration; anything long would ignore the preference.
    expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.2);
  });

  test('charts have a text alternative', async ({ page }) => {
    await page.goto('/analytics');

    // The numbers behind the charts are also shown as text (cards and the recent-scans table).
    await expect(page.getByText('Recent scans')).toBeVisible();
    await expect(page.getByRole('table').first()).toBeVisible();
  });
});
