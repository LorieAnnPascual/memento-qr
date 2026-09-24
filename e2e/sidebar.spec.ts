import { test, expect } from '@playwright/test';

test.describe('Sidebar hide / show', () => {
  test('hiding leaves only icons, keeps working, and is remembered', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('aside');
    await expect(sidebar).toHaveAttribute('data-collapsed', 'false');
    const wide = (await sidebar.boundingBox())!.width;

    await sidebar.getByRole('button', { name: 'Hide sidebar' }).click();
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeLessThan(wide / 2);

    // Labels are gone visually but every link is still reachable by name.
    await expect(sidebar.getByText('Analytics', { exact: true })).toHaveCount(0);
    await sidebar.getByRole('link', { name: 'Analytics' }).click();
    await expect(page).toHaveURL(/\/analytics/);

    // Remembered across a reload (no flash: the server renders it collapsed).
    await page.reload();
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true');

    await sidebar.getByRole('button', { name: 'Show sidebar' }).click();
    await expect(sidebar).toHaveAttribute('data-collapsed', 'false');
    await expect(sidebar.getByText('Analytics', { exact: true })).toBeVisible();
    await page.reload();
    await expect(sidebar).toHaveAttribute('data-collapsed', 'false');
  });
});
