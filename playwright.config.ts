import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1440, height: 1050 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm exec tsx scripts/dev.ts --production',
    url: 'http://localhost:3000/api/health/ready',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      DEMO_MODE: 'true',
      NODE_ENV: 'production',
      APP_URL: 'http://localhost:3000',
      SQLITE_PATH: 'data/e2e.sqlite',
    },
  },
});
