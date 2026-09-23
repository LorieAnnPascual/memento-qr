import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    // Full-page component tests (the QR designer) are slow under parallel load.
    testTimeout: 15000,
    globals: true,
    setupFiles: ['./__tests__/setup.ts'],
    include: ['__tests__/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/lib/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}', 'src/app/api/**/*.ts', 'src/app/q/**/*.ts'],
      exclude: [
        'src/components/ui/**', // shadcn/ui is third-party
        'src/lib/db/migrations/**', // generated SQL/JSON
        'src/lib/db/seed*.ts', // one-off scripts
        'src/lib/db/schema.ts', // declarative table definitions
        'src/lib/db/index.ts', // connection setup
      ],
      // Enforced where unit tests are the right tool. Canvas/card-export code and
      // form components need a real browser, so they are covered by the
      // Playwright suite (e2e/) instead and only get an overall floor here.
      thresholds: {
        lines: 55,
        statements: 55,
        functions: 45,
        branches: 55,
        'src/app/api/**': { lines: 85, statements: 85 },
        'src/lib/pages/**': { lines: 90, statements: 90 },
        'src/lib/analytics/**': { lines: 90, statements: 90 },
        'src/lib/activity/**': { lines: 90, statements: 90 },
        'src/lib/qr/payloads.ts': { lines: 100, statements: 100, functions: 100 },
      },
    },
  },
});
