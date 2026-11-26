import { expect, test, type Page } from '@playwright/test';
import {
  expectNoSeriousAccessibilityIssues,
  expectNoSidewaysScroll,
  signInAsAccount,
} from '../helpers';

test.describe.configure({ timeout: 120_000 });

const openTab = (page: Page, name: string) => page.getByRole('tab', { name }).click();

test('play happens in sessions: nothing is recorded until one starts, and each has its own part of the timeline', async ({
  page,
}) => {
  await signInAsAccount(page, 'Dana');
  // Started by hand here, to see the campaign before any session.
  await page.getByRole('button', { name: 'Start a campaign' }).click();
  const form = page.getByRole('form', { name: 'Start a campaign' });
  await form.getByLabel('Campaign name').fill('The Drowned Valley');
  await form.getByLabel('Your name').fill('Dana');
  await form.getByRole('button', { name: 'Start campaign' }).click();
  await expect(page.getByTestId('session-status')).toContainText('No session is being played.');
  await expectNoSeriousAccessibilityIssues(page);

  // Between sessions: a roll is shown to the roller and not recorded; no beat can be added; no fight.
  await page
    .getByRole('group', { name: 'Roll in the open' })
    .getByRole('button', { name: 'd6' })
    .click();
  await expect(page.getByText(/^You rolled a d6: \d\.$/)).toBeVisible();
  await expect(
    page.getByText('No session is being played, so rolls are not recorded.'),
  ).toBeVisible();
  await openTab(page, 'Story');
  await expect(page.getByText('Start a session, above, to record what happens.')).toBeVisible();
  await expect(page.getByRole('form', { name: 'Add a story beat' })).toHaveCount(0);
  await expect(page.getByText('Nothing has happened yet.')).toBeVisible();
  await openTab(page, 'Fight');
  await expect(page.getByRole('button', { name: 'Start a fight' })).toBeDisabled();

  // Session 1: a beat and a roll, both on the timeline under the session.
  await page.getByRole('button', { name: 'Start session 1' }).click();
  await expect(page.getByTestId('session-status')).toContainText('Session 1 is being played.');
  await expect(page.getByRole('button', { name: 'Start a fight' })).toBeEnabled();
  await openTab(page, 'Story');
  const beat = page.getByRole('form', { name: 'Add a story beat' });
  await beat.getByLabel('What just happened?').fill('The party reached the gorge at dusk.');
  await beat.getByRole('button', { name: 'Add to the timeline' }).click();
  // At laptop width the party, and its dice, are always in view and have no tab.
  if (await page.getByRole('tab', { name: 'Party' }).count()) await openTab(page, 'Party');
  await page
    .getByRole('group', { name: 'Roll in the open' })
    .getByRole('button', { name: 'd20' })
    .click();
  await expect(page.getByRole('list', { name: 'Latest on the timeline' })).toContainText(
    /Dana rolled a d20: \d+/,
  );
  await openTab(page, 'Story');
  const first = page.getByRole('list', { name: /^Session 1,/ }).locator('li > p');
  await expect(first).toHaveCount(2);
  await expect(first.nth(0)).toHaveText(/^Dana rolled a d20: \d+$/);
  await expect(first.nth(1)).toHaveText('The party reached the gorge at dusk.');
  await expect(page.getByRole('heading', { name: /Session 1/ })).toContainText('Being played now');
  await expectNoSeriousAccessibilityIssues(page);
  await expectNoSidewaysScroll(page);

  // "The story only" leaves the roll out.
  await page.getByRole('combobox', { name: 'Show', exact: true }).selectOption('story');
  await expect(first).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Show', exact: true }).selectOption('all');

  // Ending it records who ran it and how long it was, and it can be given a summary.
  await page.getByRole('button', { name: 'End the session' }).click();
  await expect(page.getByTestId('session-status')).toContainText('No session is being played.');
  await expect(page.getByTestId('session-1')).toContainText(/1 min · Human Warden/);
  await page.getByRole('button', { name: 'Write a summary' }).click();
  await page
    .getByRole('group', { name: 'Summary of session 1' })
    .getByLabel('Summary')
    .fill('They found the bridge cut.');
  await page.getByRole('button', { name: 'Save summary' }).click();
  await expect(page.getByText('They found the bridge cut.')).toBeVisible();

  // The next sitting is session 2, with its own part of the timeline above the first.
  await page.getByRole('button', { name: 'Start session 2' }).click();
  await beat.getByLabel('What just happened?').fill('Morning. The ferry is gone.');
  await beat.getByRole('button', { name: 'Add to the timeline' }).click();
  await expect(page.getByRole('list', { name: /^Session 2,/ }).locator('li > p')).toHaveText([
    'Morning. The ferry is gone.',
  ]);
  await expect(first).toHaveCount(2);
  const headings = page.getByRole('heading', { level: 3, name: /^Session \d/ });
  await expect(headings.nth(0)).toContainText('Session 2');
  await expect(headings.nth(1)).toContainText('Session 1');
  await expectNoSeriousAccessibilityIssues(page);
});
