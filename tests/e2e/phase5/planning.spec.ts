import { expect, test, type Page } from '@playwright/test';
import {
  expectNoSeriousAccessibilityIssues,
  expectNoSidewaysScroll,
  signInAsAccount,
  startCampaign,
} from '../helpers';

test.describe.configure({ timeout: 120_000 });

const openTab = (page: Page, name: string) => page.getByRole('tab', { name }).click();

test('a Warden plans a session on cards, runs its fight from the card, and the timeline keeps up', async ({
  page,
}) => {
  await signInAsAccount(page, 'Dana');
  await startCampaign(page, 'The Drowned Valley', 'Dana');
  await openTab(page, 'Story');

  // A session to plan for.
  await page.getByRole('button', { name: 'Add a session' }).click();
  const session = page.getByRole('form', { name: 'Session brief' });
  await session.getByLabel('Session title').fill('The Rope Bridge');
  await session.getByRole('button', { name: 'Save session' }).click();

  // A fight card: who is in it, and which session it belongs to.
  await page.getByRole('button', { name: 'New card' }).click();
  const card = page.getByRole('form', { name: 'New card' });
  await card.getByLabel('Kind').selectOption('fight');
  await card.getByLabel('Name', { exact: true }).fill('Ambush at the bridge');
  await card
    .getByRole('combobox', { name: 'Enemy 1', exact: true })
    .selectOption({ label: 'Bandit' });
  await card.getByLabel('How many of enemy 1').fill('2');
  await expect(card.getByLabel('Your private notes')).toHaveAttribute(
    'placeholder',
    /when they would run/,
  );
  await card.getByLabel('Part of the plan for').selectOption({ label: 'The Rope Bridge' });
  await expectNoSeriousAccessibilityIssues(page);
  await expectNoSidewaysScroll(page);
  await card.getByRole('button', { name: 'Save card' }).click();
  const ambush = page.getByTestId('card-Ambush at the bridge');
  await expect(ambush).toContainText('Enemies: 2 × Bandit');
  await expect(ambush).toContainText('The Rope Bridge');

  // A creature card takes its numbers from the rulebook's creature.
  await page.getByRole('button', { name: 'New card' }).click();
  await card.getByLabel('Kind').selectOption('creature');
  await card.getByLabel('Name', { exact: true }).fill('The thing in the reeds');
  await card.getByLabel('Its numbers').selectOption({ label: 'Wolf' });
  await card.getByRole('button', { name: 'Save card' }).click();
  await expect(page.getByTestId('card-The thing in the reeds')).toContainText('Wolf: HP 4');

  // The session's plan on its own.
  await page.getByLabel('Show').selectOption({ label: 'The plan for The Rope Bridge' });
  await expect(page.getByTestId('card-Ambush at the bridge')).toBeVisible();
  await expect(page.getByTestId('card-The thing in the reeds')).toHaveCount(0);
  await page.getByLabel('Show').selectOption({ label: 'Every card' });

  // Telling the table about a planned card reveals it in the same step.
  const beat = page.getByRole('form', { name: 'Add a story beat' });
  await beat.getByLabel('What just happened?').fill('Something moved in the reeds.');
  await beat.getByLabel('About (optional)').selectOption({ label: 'The thing in the reeds' });
  await expect(
    beat.getByLabel('Reveal The thing in the reeds to the players as well'),
  ).toBeChecked();
  await beat.getByRole('button', { name: 'Add to the timeline' }).click();
  await expect(page.getByTestId('card-The thing in the reeds')).toContainText('Met');

  // The fight starts from its card, with its enemies, and opens the tracker.
  await ambush.getByRole('button', { name: /^Start this fight/ }).click();
  await expect(page.getByTestId('enemy-Bandit 1')).toBeVisible();
  await expect(page.getByTestId('enemy-Bandit 2')).toBeVisible();
  await page.getByRole('button', { name: 'Next turn' }).click();
  await page.getByLabel('Damage to Bandit 1', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Apply damage to Bandit 1' }).click();
  await expect(page.getByText('Bandit 1 takes 2. HP 2 of 4.').first()).toBeVisible();

  // A story beat in the middle of the fight sits among the fight's own lines.
  await openTab(page, 'Story');
  await beat.getByLabel('What just happened?').fill('Old Marrow shouted a warning from the ferry.');
  await beat.getByRole('button', { name: 'Add to the timeline' }).click();
  await openTab(page, 'Fight');
  await page.getByRole('button', { name: 'End the fight' }).click();
  await openTab(page, 'Story');

  const lines = page.getByRole('list', { name: /Story beats/ }).locator('li > p');
  await expect(lines).toHaveText([
    'The fight ended.',
    'Old Marrow shouted a warning from the ferry.',
    'Bandit 1 takes 2. HP 2 of 4.',
    'Round 1: the enemies.',
    'A fight began: Ambush at the bridge.',
    'Something moved in the reeds.',
  ]);
  await expect(page.getByTestId('card-Ambush at the bridge')).toContainText('Met');
  await expectNoSeriousAccessibilityIssues(page);
});

test('a world made outside any campaign can be used to build a character', async ({ page }) => {
  await signInAsAccount(page, 'Dana');
  await page.getByRole('link', { name: 'Open your worlds' }).click();
  await page.getByLabel(/New world.s name/).fill('The Drowned Lands');
  await page.getByRole('button', { name: 'Make this world' }).click();
  await expect(page.getByRole('heading', { name: 'The Drowned Lands', level: 1 })).toBeVisible();
  await expect(
    page.getByText(/rulebook.s own Origins, Affinities, Abilities, gear and creatures are always/),
  ).toBeVisible();

  await page.getByRole('button', { name: 'New Origin' }).click();
  const origin = page.getByRole('form', { name: 'New Origin' });
  await origin.getByLabel('Origin name').fill('Riverfolk');
  await origin.getByLabel('Trait').fill('You swim as fast as you walk.');
  await origin.getByLabel('Item 1', { exact: true }).fill('Fishing spear');
  await origin.getByRole('button', { name: 'Save Origin' }).click();
  await expect(page.getByText('Riverfolk saved.')).toBeVisible();
  await expectNoSeriousAccessibilityIssues(page);

  await page.getByRole('link', { name: '← Your worlds' }).click();
  await expect(page.getByRole('link', { name: /The Drowned Lands/ })).toContainText(
    '1 things made',
  );
  await page.getByRole('link', { name: '← Home' }).click();

  // In the builder, choosing the world adds its Origin to the rulebook's.
  await page.getByRole('link', { name: 'Make a character' }).click();
  await page
    .getByLabel('Which world is this character for?')
    .selectOption({ label: 'Your world The Drowned Lands' });
  await page.getByLabel('Strength').fill('9');
  await page.getByLabel('Dexterity').fill('13');
  await page.getByLabel('Willpower').fill('11');
  const next = () => page.getByRole('button', { name: 'Next' }).click();
  await next();
  await page.getByLabel('Hit Protection').fill('4');
  await next();
  await page.getByLabel('Name', { exact: true }).fill('Orla');
  await page
    .getByLabel('Kind of world, for ideas')
    .selectOption({ label: 'Pirates and the high seas' });
  await expect(page.getByText(/Stuck\? Try one of these: Anne/)).toBeVisible();
  await page.getByLabel('Background').fill('Navigator');
  await next();
  await expect(page.getByRole('radio', { name: /Riverfolk/ })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(9);
  await page.getByRole('radio', { name: /Riverfolk/ }).check();
  await next();
  await page.getByLabel(/^No\./).check();
  await next();
  await page.getByLabel('Coins').fill('10');
  await page.getByRole('button', { name: 'Finish character' }).click();
  await expect(page.getByText('Navigator · Riverfolk · Tier 1')).toBeVisible();
  await expect(page.getByText('Fishing spear')).toBeVisible();
});
