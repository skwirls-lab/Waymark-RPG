import { expect, test } from '@playwright/test';

test('a guest can sign in on the deployed app, and sign out again', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Continue as a guest' }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome, guest' }),
    `Sign-in failed. Browser errors: ${problems.join(' | ')}`,
  ).toBeVisible({
    timeout: 20_000,
  });
  // The database answers too: the character list loads rather than hanging.
  await expect(page.getByText('You have no character yet.')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Continue as a guest' })).toBeVisible();
});

test('the Google sign-in button is offered and enabled', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled({
    timeout: 20_000,
  });
});
