import { test, expect } from '@playwright/test';

import { qaName } from './helpers/api';

test.describe('QR templates', () => {
  test('the gallery lists the system templates @mobile', async ({ page }) => {
    await page.goto('/templates');

    await expect(page.getByRole('link', { name: 'Use template' })).toHaveCount(await page.getByRole('link', { name: 'Use template' }).count());
    expect(await page.getByRole('link', { name: 'Use template' }).count()).toBeGreaterThanOrEqual(6);
  });

  test('the category filter narrows the list', async ({ page }) => {
    await page.goto('/templates');
    const all = await page.getByRole('link', { name: 'Use template' }).count();

    await page.getByRole('combobox').first().click();
    const options = page.getByRole('option');
    const choices = await options.allInnerTexts();
    const category = choices.find((choice) => !/all categories/i.test(choice))!;
    await options.filter({ hasText: category }).first().click();

    const filtered = await page.getByRole('link', { name: 'Use template' }).count();
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThanOrEqual(all);
  });

  test('using a template opens the designer already styled', async ({ page }) => {
    await page.goto('/templates');
    await page.getByRole('link', { name: 'Use template' }).first().click();

    await expect(page).toHaveURL(/\/qr\/new\?template=/);
    await page.getByRole('textbox', { name: 'Website URL' }).fill('example.com');
    await expect(page.getByTestId('qr-preview-canvas').locator('canvas, svg').first()).toBeVisible();
  });

  test('save your own template from the designer, then delete it', async ({ page, request }) => {
    const name = qaName('template');
    await page.goto('/qr/new');
    await page.getByRole('textbox', { name: 'Website URL' }).fill('example.com');

    await page.getByRole('tab', { name: 'Style' }).click();
    await page.getByRole('button', { name: 'Choose template' }).click();
    await page.getByRole('button', { name: 'Save current style as template' }).click();
    await page.getByLabel('Name', { exact: true }).last().fill(name);
    await page.getByRole('button', { name: 'Save template' }).first().click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Save template' }).click();

    let created: { id: string; name: string; isSystem: boolean } | undefined;
    await expect
      .poll(async () => {
        const list = (await (await request.get('/api/templates')).json()) as { items: { id: string; name: string; isSystem: boolean }[] };
        created = list.items.find((item) => item.name === name);
        return created?.isSystem;
      })
      .toBe(false);

    try {
      await page.goto('/templates');
      await expect(page.getByText(name)).toBeVisible();

      await page.getByLabel(`Delete ${name}`).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
      await expect(page.getByText(name)).toBeHidden();
    } finally {
      if (created) await request.delete(`/api/templates/${created.id}`);
    }
  });

  test('system templates have no edit or delete buttons', async ({ page }) => {
    await page.goto('/templates');

    await expect(page.getByLabel(/^Delete /)).toHaveCount(await page.getByLabel(/^Delete \[QA\]/).count());
  });
});
