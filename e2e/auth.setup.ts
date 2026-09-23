import { test as setup, expect } from '@playwright/test';

import { PASSWORD, USERS } from './helpers/users';

// Sign in once per test account and reuse the session, instead of logging in before every test.
for (const [name, user] of Object.entries(USERS).filter(([key]) => key !== 'signout')) {
  setup(`sign in as ${name}`, async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/');
    await page.context().storageState({ path: user.file });
  });
}
