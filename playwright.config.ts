import { defineConfig, devices } from '@playwright/test';

/**
 * Brings up both dev servers and runs the one test. The API server is started
 * with `start` rather than `dev` because `dev` runs under `node --watch`, whose
 * child process can outlive Playwright's teardown and keep port 4000.
 *
 * Both servers are waited on by port rather than by URL: every /api/v1 route
 * requires the bearer token, so a URL probe would see 401 and give up.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'],  launchOptions: {
    slowMo: 1000, 
  } } }],
  webServer: [
    {
      command: 'pnpm --filter @fixture/api run start',
      port: 4000,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @fixture/web run dev',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
