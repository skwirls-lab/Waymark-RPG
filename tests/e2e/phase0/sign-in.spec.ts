import { expect, test } from '@playwright/test';
import { expectNoSeriousAccessibilityIssues } from '../helpers';

test.describe('phase 0: signing in', () => {
  test('a signed-out visitor lands on the sign-in screen', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('heading', { name: 'Waymark' })).toBeVisible();
    await expectNoSeriousAccessibilityIssues(page);
  });

  test('a guest signs in, sees the home screen, and signs out', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Continue as a guest' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome, guest' })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expectNoSeriousAccessibilityIssues(page);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Continue as a guest' })).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('a Google user is greeted by name', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    // The Auth emulator accepts a stand-in Google identity directly.
    await page.evaluate(() =>
      window.__waymarkTest!.signInAsGoogleUser('Esme Harkness', 'esme@example.com'),
    );
    await expect(page.getByRole('heading', { name: 'Welcome, Esme Harkness' })).toBeVisible();
  });

  // Opens the real sign-in window, which loads a script from Google's servers.
  // Runs in CI. Build containers without access to Google set
  // WAYMARK_NO_GOOGLE_NETWORK, which leaves this one test out (see playwright.config.ts).
  test(
    'the Google button opens the sign-in window and completes sign-in',
    { tag: '@google-network' },
    async ({ page }) => {
      await page.goto('/');
      const popupOpens = page.waitForEvent('popup');
      await page.getByRole('button', { name: 'Continue with Google' }).click();
      const popup = await popupOpens;
      await popup.getByRole('button', { name: /add new account/i }).click();
      await popup.getByRole('button', { name: /auto-generate/i }).click();
      await popup.getByRole('button', { name: /sign in with/i }).click();
      await expect(page.getByRole('heading', { name: /^Welcome, / })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    },
  );

  test('the layout fits the screen without sideways scrolling', async ({ page }) => {
    await page.goto('/sign-in');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('the app can be installed: manifest and service worker are served', async ({
    page,
    request,
  }) => {
    const manifest = await request.get('/manifest.webmanifest');
    expect(manifest.ok()).toBe(true);
    expect((await manifest.json()).name).toBe('Waymark');
    expect((await request.get('/sw.js')).ok()).toBe(true);
    await page.goto('/sign-in');
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  });
});
