import { expect, test } from '@playwright/test';

test('on the deployed app a guest can sign in, start a campaign, and delete their account', async ({
  page,
}) => {
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

  // The server answers: starting a campaign goes through a Cloud Function.
  await page.getByRole('button', { name: 'Start a campaign' }).click();
  const form = page.getByRole('form', { name: 'Start a campaign' });
  await form.getByLabel('Campaign name').fill('Deploy check');
  await form.getByLabel('Your name').fill('Check');
  await form.getByRole('button', { name: 'Start campaign' }).click();
  const started = page.getByRole('heading', { name: 'Deploy check', level: 1 });
  await expect(started.or(failure)).toBeVisible({ timeout: 30_000 });
  if (await failure.isVisible()) {
    throw new Error(
      `Starting a campaign failed on the deployed app: "${await failure.textContent()}". Browser errors: ${problems.join(' | ')}`,
    );
  }

  // Deleting the account removes the campaign and this guest's sign-in, so the
  // check leaves nothing behind. It also proves account deletion works live.
  await page.getByRole('link', { name: '← Home' }).click();
  await page.getByRole('link', { name: 'Account' }).click();
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await page.getByRole('button', { name: 'Delete everything' }).click();
  const signedOut = page.getByRole('button', { name: 'Continue as a guest' });
  const refused = page.getByRole('status').filter({ hasText: /./ });
  await expect(signedOut.or(refused)).toBeVisible({ timeout: 30_000 });
  if (!(await signedOut.isVisible())) {
    throw new Error(
      `Deleting the account failed on the deployed app: "${await refused.first().textContent()}". Browser errors: ${problems.join(' | ')}`,
    );
  }
});

test('the Google sign-in button is offered and enabled', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled({
    timeout: 20_000,
  });
});
