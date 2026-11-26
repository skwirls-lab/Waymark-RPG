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
  await page.getByRole('button', { name: 'Add a plan' }).click();
  const session = page.getByRole('form', { name: 'Plan' });
  await session.getByLabel('Plan title').fill('The Rope Bridge');
  await session.getByRole('button', { name: 'Save plan' }).click();

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
  await page.getByLabel('Show').selectOption({ label: 'The plan: The Rope Bridge' });
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

  const lines = page.getByRole('list', { name: /^Session 1,/ }).locator('li > p');
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

test("loot on a card is a piece of the world's gear, and is handed to a character from the card", async ({
  page,
}) => {
  await signInAsAccount(page, 'Dana');
  await startCampaign(page, 'The Drowned Valley', 'Dana');

  // A character the Warden runs, to receive it.
  await page.getByRole('link', { name: 'Add a character you run' }).click();
  const next = () => page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Strength').fill('9');
  await page.getByLabel('Dexterity').fill('13');
  await page.getByLabel('Willpower').fill('11');
  await next();
  await page.getByLabel('Hit Protection').fill('4');
  await next();
  await page.getByLabel('Name', { exact: true }).fill('Pip');
  await page.getByLabel('Background').fill('Scout');
  await next();
  await page.getByRole('radio', { name: /No Origin/ }).check();
  await next();
  await page.getByLabel(/^No\./).check();
  await next();
  await page.getByLabel('Coins').fill('10');
  await page.getByLabel('Weapon').fill('3');
  await page.getByLabel('Armor').fill('4');
  await page.getByLabel('Tools').fill('1');
  await page.getByRole('button', { name: 'Finish character' }).click();
  await expect(page.getByTestId('summary-Pip')).toBeVisible();

  // Gear made in the workshop.
  await openTab(page, 'Workshop');
  await page.getByRole('button', { name: 'New item' }).click();
  const gear = page.getByRole('form', { name: 'New gear' });
  await gear.getByLabel('Item name').fill('Tide hook');
  await gear.getByLabel('Damage').selectOption('8');
  await gear.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByText(/Tide hook saved/)).toBeVisible();

  // A loot card that is that piece of gear.
  await openTab(page, 'Story');
  await page.getByRole('button', { name: 'New card' }).click();
  const card = page.getByRole('form', { name: 'New card' });
  await card.getByLabel('Kind').selectOption('item');
  await card.getByLabel('Name', { exact: true }).fill("The ferryman's hook");
  await card.getByLabel('Which item it is').selectOption({ label: 'Tide hook' });
  await card.getByRole('button', { name: 'Save card' }).click();
  const loot = page.getByTestId("card-The ferryman's hook");
  await expect(loot).toContainText('Tide hook: weapon · d8');
  await expectNoSeriousAccessibilityIssues(page);

  // Handing it over: choose who gets it, and it is on their sheet.
  await loot.getByRole('button', { name: /^Give/ }).click();
  const giving = page.getByRole('group', { name: 'Give an item' });
  await expect(giving).toContainText('Who gets Tide hook?');
  await expectNoSidewaysScroll(page);
  await giving.getByRole('button', { name: 'Give to Pip' }).click();
  await expect(giving).toHaveCount(0);
  await page.getByTestId('summary-Pip').getByRole('link', { name: 'Open' }).click();
  // The item is on the sheet. (Its name can also appear in the line saying it was given.)
  await expect(page.getByText('Tide hook').first()).toBeVisible();
});
