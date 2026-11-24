import { expect, test } from '@playwright/test';

test('a guest can sign in on the deployed app, and sign out again', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Continue as a guest' }).click();

  // Either the home screen appears, or the app says why sign-in failed.
  const welcome = page.getByRole('heading', { name: 'Welcome, guest' });
  const failure = page.getByRole('alert');
  await expect(welcome.or(failure)).toBeVisible({ timeout: 20_000 });
  if (await failure.isVisible()) {
    throw new Error(
      `Guest sign-in failed on the deployed app: "${await failure.textContent()}". Browser errors: ${problems.join(' | ')}`,
    );
  }
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
