import { defineConfig } from 'vitest/config';
if (
  process.env.TEST_DATABASE_URL &&
  !new URL(process.env.TEST_DATABASE_URL).pathname.includes('test')
)
  throw new Error('TEST_DATABASE_URL must name an explicitly disposable test database.');
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      DEMO_MODE: 'true',
      DATABASE_URL: process.env.TEST_DATABASE_URL || '',
      SQLITE_PATH: 'data/test.sqlite',
      APP_URL: 'http://localhost:3000',
    },
  },
});
