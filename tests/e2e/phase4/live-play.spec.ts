import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  buildWren,
  expectNoSeriousAccessibilityIssues,
  expectNoSidewaysScroll,
  joinWithCode,
  readFromEmulator,
  signInAsAccount,
  signInAsGuest,
  startCampaign,
  stat,
} from '../helpers';

const CAMPAIGN = 'The Rope Bridge';

// Several devices in one test take longer than a single-device flow.
test.describe.configure({ timeout: 120_000 });

async function newDevice(browser: Browser): Promise<Page> {
  return (await browser.newContext(test.info().project.use)).newPage();
}

/**
 * A Warden with a campaign, and a player whose character Wren is in it.
 * Leaves the Warden on the campaign page and the player on Wren's sheet.
 */
async function table(
  warden: Page,
  browser: Browser,
  options: { guest?: boolean; direct?: boolean } = {},
) {
  await signInAsAccount(warden, 'Dana');
  const code = await startCampaign(warden, CAMPAIGN, 'Dana');
  const player = await newDevice(browser);
  if (options.guest) await signInAsGuest(player);
  else await signInAsAccount(player, 'Sam');
  await buildWren(player);
  const sheetUrl = player.url();
  await player.getByRole('link', { name: /All characters/ }).click();
  await joinWithCode(player, code, 'Sam', CAMPAIGN);
  await player.getByRole('button', { name: 'Bring Wren in' }).click();
  await expect(warden.getByTestId('summary-Wren')).toContainText('played by Sam');
  if (options.direct) {
    await player.getByLabel(/^Directly/).check();
    await expect(warden.getByTestId('summary-Wren')).not.toContainText('asks first');
  }
  await player.goto(sheetUrl);
  await expect(player.getByRole('heading', { name: 'Wren', level: 1 })).toBeVisible();
  return { player, sheetUrl, code };
}

/** Opens the Warden's action dialog for a character and picks what happens. */
async function act(warden: Page, name: string, what: string) {
  await warden.getByRole('button', { name: `Act on ${name}` }).click();
  await warden.getByLabel('What happens?').selectOption({ label: what });
}

test.describe('phase 4: the Warden changes a sheet directly', () => {
  test('damage reaches the player within two seconds, shows in the feed, and can be undone', async ({
    page: warden,
    browser,
  }) => {
    const { player } = await table(warden, browser, { direct: true });
    await expectNoSeriousAccessibilityIssues(warden);
    await expectNoSidewaysScroll(warden);

    await act(warden, 'Wren', 'Deal damage');
    await warden.getByLabel('Damage rolled').fill('3');
    await expectNoSeriousAccessibilityIssues(warden);
    const started = Date.now();
    await warden.getByRole('button', { name: 'Apply' }).click();
    await expect(stat(player, 'hp')).toHaveText('2', { timeout: 2000 });
    const elapsed = Date.now() - started;
    test
      .info()
      .annotations.push({ type: 'warden-to-player latency', description: `${elapsed} ms` });
    console.log(`Warden-to-player latency (${test.info().project.name}): ${elapsed} ms`);
    expect(elapsed).toBeLessThan(2000);

    await expect(warden.getByRole('status')).toContainText('Wren took 2 damage. HP 2.');
    await expect(warden.getByRole('list', { name: 'Latest on the timeline' })).toContainText(
      'Wren took 2 damage. HP 2.',
    );
    await expect(warden.getByTestId('summary-Wren')).toContainText('HP 2 of 4');

    // The Warden undoes it; the player's sheet goes back.
    await act(warden, 'Wren', 'Undo the last change');
    await warden.getByRole('button', { name: 'Apply' }).click();
    await expect(stat(player, 'hp')).toHaveText('4');
  });

  test('damage to exactly 0 HP asks the player to roll the Scar, and the Warden sees the result', async ({
    page: warden,
    browser,
  }) => {
    const { player } = await table(warden, browser, { direct: true });
    await act(warden, 'Wren', 'Deal damage');
    await warden.getByLabel('Damage rolled').fill('5');
    await warden.getByRole('button', { name: 'Apply' }).click();

    const request = player.getByRole('group', { name: 'Request from the Warden' });
    await expect(request).toContainText('Roll a Scar');
    await expect(stat(player, 'hp')).toHaveText('0');
    await request.getByRole('button', { name: 'Roll now' }).click();
    await player.getByRole('spinbutton', { name: /^Scar/ }).fill('2');
    await player.getByLabel('Roll for the scar').fill('6');
    await player.getByRole('button', { name: 'Record scar' }).click();
    await expect(request).toHaveCount(0);
    await expect(warden.getByText('Scar: Rattling Blow.').first()).toBeVisible();
  });

  test('the Warden can give and take items, add Fatigue, and award a Tier', async ({
    page: warden,
    browser,
  }) => {
    const { player } = await table(warden, browser, { direct: true });

    await act(warden, 'Wren', 'Give an item');
    await warden.getByLabel('Item name').fill('Storm lantern');
    await warden.getByRole('button', { name: 'Apply' }).click();
    await expect(player.locator('.items').getByText('Storm lantern')).toBeVisible();
    await expect(player.getByTestId('slots')).toHaveText('7 of 10 slots');

    await act(warden, 'Wren', 'Take an item');
    await warden.getByRole('dialog').getByRole('combobox').nth(1).selectOption({ label: 'Rope' });
    await warden.getByRole('button', { name: 'Apply' }).click();
    await expect(player.getByTestId('slots')).toHaveText('6 of 10 slots');

    await act(warden, 'Wren', 'Add Fatigue');
    await warden.getByLabel('How much Fatigue').fill('2');
    await warden.getByRole('button', { name: 'Apply' }).click();
    await expect(player.getByTestId('fatigue')).toHaveText('2');

    await act(warden, 'Wren', 'Award a Tier');
    await warden.getByRole('button', { name: 'Apply' }).click();
    await expect(player.getByText('Scout · Tier 2')).toBeVisible();
  });

  test('a change by the Warden and one by the player at the same moment are both kept', async ({
    page: warden,
    browser,
    request,
  }) => {
    const { player, sheetUrl } = await table(warden, browser, { direct: true });
    await act(warden, 'Wren', 'Deal damage');
    await warden.getByLabel('Damage rolled').fill('3');

    await Promise.all([
      warden.getByRole('button', { name: 'Apply' }).click(),
      player.getByRole('button', { name: 'Add 1 Fatigue' }).click(),
    ]);

    await expect(stat(player, 'hp')).toHaveText('2');
    await expect(player.getByTestId('fatigue')).toHaveText('1');
    const id = sheetUrl.split('/c/')[1]!;
    await expect
      .poll(async () => {
        const sheet = (await readFromEmulator(request, `characters/${id}`)).body?.fields.sheet
          .mapValue.fields;
        return `${sheet?.hp.mapValue.fields.current.integerValue}/${sheet?.fatigue.integerValue}`;
      })
      .toBe('2/1');
  });
});

test.describe('phase 4: ask me first', () => {
  test('a change waits for the player; accepting applies it and its follow-up roll', async ({
    page: warden,
    browser,
  }) => {
    const { player } = await table(warden, browser, { guest: true });
    await expect(warden.getByTestId('summary-Wren')).toContainText('asks first');

    await act(warden, 'Wren', 'Deal damage');
    await expect(warden.getByText('chose “ask me first”')).toBeVisible();
    await warden.getByLabel('Damage rolled').fill('7');
    await warden.getByRole('button', { name: 'Send to the player' }).click();
    await expect(warden.getByRole('status')).toContainText('Asked Sam to accept: Take 7 damage.');

    // Nothing has changed yet.
    const asked = player.getByRole('group', { name: 'Request from the Warden' });
    await expect(asked).toContainText('Take 7 damage');
    await expect(stat(player, 'hp')).toHaveText('4');
    await expectNoSeriousAccessibilityIssues(player);

    await asked.getByRole('button', { name: 'Accept' }).click();
    await expect(stat(player, 'hp')).toHaveText('0');
    await expect(stat(player, 'strength')).toHaveText('7');
    await expect(player.getByRole('dialog', { name: 'Strength save' })).toBeVisible();
    await player.getByLabel('Your roll').fill('5');
    await player.getByRole('button', { name: 'Resolve' }).click();

    await expect(
      warden.getByText('Wren took 6 damage. HP 0. Strength down 2 to 7.').first(),
    ).toBeVisible();
    await expect(warden.getByTestId('summary-Wren')).toContainText('HP 0 of 4');
  });

  test('declining leaves the sheet alone, and the Warden sees the answer', async ({
    page: warden,
    browser,
  }) => {
    const { player } = await table(warden, browser, { guest: true });
    await act(warden, 'Wren', 'Add Fatigue');
    await warden.getByLabel('How much Fatigue').fill('1');
    await warden.getByRole('button', { name: 'Send to the player' }).click();

    await player
      .getByRole('group', { name: 'Request from the Warden' })
      .getByRole('button', { name: 'Decline' })
      .click();
    await expect(player.getByTestId('fatigue')).toHaveText('0');
    await expect(warden.getByText('Declined')).toBeVisible();

    // The Warden clears the answered request away.
    await warden.getByRole('button', { name: 'Clear request to Sam' }).click();
    await expect(warden.getByText('Declined')).toHaveCount(0);
  });
});

test.describe('phase 4: saves, blasts, the feed and presence', () => {
  test('the Warden calls for a save; the player rolls; the result comes back', async ({
    page: warden,
    browser,
  }) => {
    const { player } = await table(warden, browser, { direct: true });
    await act(warden, 'Wren', 'Call for a save');
    await warden.getByRole('combobox', { name: 'Attribute', exact: true }).selectOption('dex');
    await warden.getByLabel('Why (optional)').fill('to grab the rope');
    await warden.getByRole('button', { name: 'Apply' }).click();

    const asked = player.getByRole('group', { name: 'Request from the Warden' });
    await expect(asked).toContainText('Make a Dexterity save: to grab the rope');
    await asked.getByRole('button', { name: 'Roll now' }).click();
    await player.getByLabel('Your roll').fill('9');
    await player.getByRole('button', { name: 'Send result' }).click();

    await expect(
      warden.getByText('Wren rolled 9 against Dexterity 13: success.').first(),
    ).toBeVisible();
    await expect(warden.getByRole('list', { name: 'Latest on the timeline' })).toContainText(
      'Wren rolled 9 against Dexterity 13: success.',
    );
  });

  test('a Blast damages three characters at once, each by its own roll', async ({
    page: warden,
    browser,
  }) => {
    await table(warden, browser, { direct: true });
    for (const name of ['Pip', 'Orla']) {
      await warden.getByRole('link', { name: 'Add a character you run' }).click();
      await warden.getByLabel('Strength').fill('10');
      await warden.getByLabel('Dexterity').fill('10');
      await warden.getByLabel('Willpower').fill('10');
      await warden.getByRole('button', { name: 'Next' }).click();
      await warden.getByLabel('Hit Protection').fill('5');
      await warden.getByRole('button', { name: 'Next' }).click();
      await warden.getByLabel('Name', { exact: true }).fill(name);
      await warden.getByLabel('Background').fill('Hunter');
      await warden.getByRole('button', { name: 'Next' }).click();
      await warden.getByRole('radio', { name: /Climber/ }).check();
      await warden.getByRole('button', { name: 'Next' }).click();
      await warden.getByLabel(/^No\./).check();
      await warden.getByRole('button', { name: 'Next' }).click();
      await warden.getByLabel('Coins').fill('7');
      await warden.getByRole('button', { name: 'Finish character' }).click();
      await expect(warden.getByTestId(`summary-${name}`)).toContainText('HP 5 of 5');
    }

    for (const name of ['Wren', 'Pip', 'Orla']) await warden.getByLabel(`Select ${name}`).check();
    await warden.getByRole('button', { name: 'Damage the 3 selected' }).click();
    await warden.getByLabel('Damage to Wren').fill('3'); // 1 Armor: takes 2
    await warden.getByLabel('Damage to Pip').fill('2');
    await warden.getByLabel('Damage to Orla').fill('4');
    await warden.getByRole('button', { name: 'Apply to all' }).click();

    await expect(warden.getByTestId('summary-Wren')).toContainText('HP 2 of 4');
    await expect(warden.getByTestId('summary-Pip')).toContainText('HP 3 of 5');
    await expect(warden.getByTestId('summary-Orla')).toContainText('HP 1 of 5');
  });

  test('dice rolled in the open and sheet changes appear for everyone, and the Warden sees who is here', async ({
    page: warden,
    browser,
  }) => {
    const { player } = await table(warden, browser, { direct: true });

    // The player's own change is told to the table.
    await player.getByRole('button', { name: 'Add 1 Fatigue' }).click();
    await expect(warden.getByRole('list', { name: 'Latest on the timeline' })).toContainText(
      'Wren: Gained 1 Fatigue.',
    );

    // Presence: the player has the sheet open.
    await expect(warden.getByText('here now').first()).toBeVisible();

    // A roll in the open, from the campaign page.
    await player.getByRole('link', { name: /All characters/ }).click();
    await player.getByRole('link', { name: new RegExp(CAMPAIGN) }).click();
    await player
      .getByRole('group', { name: 'Roll in the open' })
      .getByRole('button', { name: 'd20' })
      .click();
    await expect(warden.getByRole('list', { name: 'Latest on the timeline' })).toContainText(
      /Sam rolled a d20: \d+/,
    );
    await expect(player.getByRole('list', { name: 'Latest on the timeline' })).toContainText(
      /Sam rolled a d20: \d+/,
    );
    await expectNoSeriousAccessibilityIssues(player);
  });
});
