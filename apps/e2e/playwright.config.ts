import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.VAST_BASE_URL ?? 'http://127.0.0.1:8080';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Local dev can start servers; in Docker CI the stack is already up.
  webServer: process.env.VAST_E2E_NO_WEBSERVER
    ? undefined
    : {
        command: 'pnpm --filter @vast/server dev',
        url: 'http://127.0.0.1:8080/api/health',
        reuseExistingServer: !process.env.CI,
        cwd: '../..',
        timeout: 120_000,
        env: {
          ...process.env,
          PORT: '8080',
          VAST_BIND: '127.0.0.1',
          VAST_RUNTIME: 'web',
          VAST_AUTH_MODE: 'none',
          VAST_SECRET_KEY: 'e2e-test-secret',
          VAST_DATA_DIR: './data/e2e',
          VAST_WEB_DIST: '../web/dist',
          MONGO_URI: process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27027',
        },
      },
});
