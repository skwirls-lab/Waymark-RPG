import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0, // a flaky test is a bug to fix, not to retry
  forbidOnly: true,
  // One test needs to reach Google's servers. CI runs it. A build container
  // that cannot reach them sets WAYMARK_NO_GOOGLE_NETWORK to leave it out.
  grepInvert: process.env.WAYMARK_NO_GOOGLE_NETWORK ? /@google-network/ : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'phone',
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
    { name: 'tablet', use: { viewport: { width: 820, height: 1180 }, hasTouch: true } },
  ],
  webServer: {
    command: 'npm run build:emulator -w app && npm run preview:emulator -w app',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
