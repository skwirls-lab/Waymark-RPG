import { defineConfig } from '@playwright/test';

// Checks run against the deployed app after each deploy. They exist because
// the emulator-backed tests cannot tell whether sign-in is switched on in the
// real project.
export default defineConfig({
  testDir: 'tests/live',
  retries: 0,
  forbidOnly: true,
  reporter: [['list']],
  use: {
    baseURL: process.env.WAYMARK_APP_URL ?? 'https://waymark-rpg-app.web.app',
    viewport: { width: 390, height: 844 },
    trace: 'off',
  },
});
