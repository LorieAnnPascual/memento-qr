import { config as loadEnv } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

loadEnv({ path: '.env.local' });

const PORT = 3000;

/**
 * E2E tests run against a production build (`pnpm build`) on the seeded QA
 * database (`pnpm db:seed`). One worker: the tests share seeded data, so they
 * run in order rather than racing each other.
 *
 * The two mobile projects run only tests tagged @mobile.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Dark/light follows the OS by default; pin light so screenshots and contrast checks are stable.
    colorScheme: 'light',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/editor.json' },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'], storageState: 'e2e/.auth/editor.json' },
      dependencies: ['setup'],
      grep: /@mobile/,
      testIgnore: /auth\.setup\.ts/,
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'], storageState: 'e2e/.auth/editor.json' },
      dependencies: ['setup'],
      grep: /@mobile/,
      testIgnore: /auth\.setup\.ts/,
    },
  ],
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
