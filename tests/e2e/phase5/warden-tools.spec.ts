import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  expectNoSeriousAccessibilityIssues,
  expectNoSidewaysScroll,
  joinWithCode,
  signInAsAccount,
  signInAsGuest,
  startCampaign,
  stat,
  uniqueEmail,
} from '../helpers';

const CAMPAIGN = 'The Drowned Valley';

test.describe.configure({ timeout: 120_000 });

async function newDevice(browser: Browser): Promise<Page> {
  return (await browser.newContext(test.info().project.use)).newPage();
}

const openTab = (page: Page, name: string) => page.getByRole('tab', { name }).click();

async function check(page: Page) {
  await expectNoSeriousAccessibilityIssues(page);
  await expectNoSidewaysScroll(page);
}

/** A Warden with a new campaign, and a guest player who has joined it. */
async function table(warden: Page, browser: Browser) {
  await signInAsAccount(warden, 'Dana');
  const code = await startCampaign(warden, CAMPAIGN, 'Dana');
  const player = await newDevice(browser);
  await signInAsGuest(player);
  await joinWithCode(player, code, 'Sam', CAMPAIGN);
  return { player };
}

test.describe('phase 5: the campaign record', () => {
  test('the Warden writes a brief, keeps a timeline and reveals a planned card to the player', async ({
    page: warden,
    browser,
  }) => {
    const { player } = await table(warden, browser);
    await openTab(warden, 'Story');
    await openTab(player, 'Story');
    await expect(player.getByText('The Warden has not written a setting yet.')).toBeVisible();

    // The brief: the setting, and one session's mission.
    await warden.getByLabel('Setting and backdrop').fill('A valley flooded a lifetime ago.');
    await warden.getByRole('button', { name: 'Save the setting' }).click();
    await expect(warden.getByText('Setting saved.')).toBeVisible();
    await warden.getByRole('button', { name: 'Add a plan' }).click();
    const session = warden.getByRole('form', { name: 'Plan' });
    await session.getByLabel('Plan title').fill('The Rope Bridge');
    await session.getByLabel('The mission').fill('Cross the gorge before dark.');
    await session.getByLabel('The stakes').fill('The medicine will not keep.');
    await check(warden);
    await session.getByRole('button', { name: 'Save plan' }).click();
    await expect(player.getByText('A valley flooded a lifetime ago.')).toBeVisible();
    await expect(player.getByText('Cross the gorge before dark.')).toBeVisible();

    // A planned card with a private note: the player sees nothing of it.
    await warden.getByRole('button', { name: 'New card' }).click();
    const card = warden.getByRole('form', { name: 'New card' });
    await card.getByLabel('Name', { exact: true }).fill('Old Marrow');
    await card.getByLabel('What the players can know').fill('Keeps the ferry.');
    await card.getByLabel('Your private notes').fill('He cut the bridge ropes.');
    await check(warden);
    await card.getByRole('button', { name: 'Save card' }).click();
    await expect(warden.getByTestId('card-Old Marrow')).toContainText('Planned');
    await expect(warden.getByTestId('card-Old Marrow')).toContainText('He cut the bridge ropes.');
    await expect(player.getByText('Nothing has been revealed yet.')).toBeVisible();

    // Beats during the session: one for everyone, one for the Warden alone.
    const beat = warden.getByRole('form', { name: 'Add a story beat' });
    await beat.getByLabel('What just happened?').fill('The bridge fell with Wren on it.');
    await beat.getByLabel('Milestone').check();
    await beat.getByRole('button', { name: 'Add to the timeline' }).click();
    await beat.getByLabel('What just happened?').fill('Marrow was seen with a knife.');
    await beat.getByLabel('Only I can see this').check();
    await beat.getByRole('button', { name: 'Add to the timeline' }).click();
    const wardenBeats = warden.getByRole('list', { name: /^Session 1,/ }).getByRole('listitem');
    await expect(wardenBeats).toHaveCount(2);
    await expect(wardenBeats.first()).toContainText('Marrow was seen with a knife.');
    const playerBeats = player.getByRole('list', { name: /^Session 1,/ }).getByRole('listitem');
    await expect(playerBeats).toHaveCount(1);
    await expect(playerBeats.first()).toContainText('The bridge fell with Wren on it.');
    await expect(playerBeats.first()).toContainText('Milestone');
    await expect(player.getByText('Marrow was seen with a knife.')).toHaveCount(0);

    // Revealed: the card appears for the player, without the private note.
    await warden.getByRole('button', { name: 'Reveal Old Marrow to players' }).click();
    await expect(player.getByTestId('card-Old Marrow')).toContainText('Keeps the ferry.');
    await expect(player.getByTestId('card-Old Marrow')).toContainText('Met');
    await expect(player.getByText('He cut the bridge ropes.')).toHaveCount(0);
    await expect(player.getByRole('button', { name: /Reveal|Edit|New card/ })).toHaveCount(0);

    // The Warden's own notes.
    await warden
      .getByRole('textbox', { name: 'Private notes' })
      .fill('Next time: the ferry at night.');
    await warden.getByRole('button', { name: 'Save notes' }).click();
    await expect(warden.getByText('Notes saved.')).toBeVisible();
    await expect(player.getByText('Your private notes')).toHaveCount(0);
    await check(warden);
    await check(player);

    // It is all still there after a reload.
    await warden.reload();
    await expect(warden.getByLabel('Setting and backdrop')).toHaveValue(
      'A valley flooded a lifetime ago.',
    );
    await expect(warden.getByRole('textbox', { name: 'Private notes' })).toHaveValue(
      'Next time: the ferry at night.',
    );
  });

  test('the timeline keeps one order when beats are added from two devices', async ({
    page: first,
    browser,
  }) => {
    // The same Warden, signed in on a phone and on a second device.
    const email = uniqueEmail('Dana');
    const signIn = async (page: Page) => {
      await page.goto('/sign-in');
      await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
      await page.evaluate(([e]) => window.__waymarkTest!.signInAsGoogleUser('Dana', e!), [email]);
      await expect(page.getByRole('heading', { name: 'Welcome, Dana' })).toBeVisible();
    };
    await signIn(first);
    await startCampaign(first, CAMPAIGN, 'Dana');
    const second = await newDevice(browser);
    await signIn(second);
    await second.goto(first.url());
    await openTab(first, 'Story');
    await openTab(second, 'Story');

    const add = async (page: Page, text: string) => {
      const form = page.getByRole('form', { name: 'Add a story beat' });
      await form.getByLabel('What just happened?').fill(text);
      await form.getByRole('button', { name: 'Add to the timeline' }).click();
    };
    const beats = (page: Page) => page.getByRole('list', { name: /^Session 1,/ }).locator('li > p');

    await add(first, 'They reached the gorge.');
    await expect(beats(second)).toHaveCount(1);
    await add(second, 'The ferryman refused them.');
    await expect(beats(first)).toHaveCount(2);
    // Two at once, one from each device.
    await Promise.all([add(first, 'Wren climbed down.'), add(second, 'Ash kept watch.')]);
    await expect(beats(first)).toHaveCount(4);
    await expect(beats(second)).toHaveCount(4);

    // Both devices settle on the same order, newest first, with the earlier beats in place.
    await expect(async () => {
      const [a, b] = await Promise.all([
        beats(first).allTextContents(),
        beats(second).allTextContents(),
      ]);
      expect(a).toEqual(b);
      expect(a.slice(2)).toEqual(['The ferryman refused them.', 'They reached the gorge.']);
    }).toPass();
    await second.reload();
    await expect(beats(second)).toHaveText(await beats(first).allTextContents());
  });
});

test.describe("phase 5: the Warden's tools", () => {
  test('a fight runs from the first turn to a morale check', async ({ page: warden }) => {
    await signInAsAccount(warden, 'Dana');
    await startCampaign(warden, CAMPAIGN, 'Dana');
    await openTab(warden, 'Fight');

    // Before the fight: how do they react?
    await warden.getByLabel(/^Reaction/).fill('2');
    await expect(warden.getByText('They mean harm.')).toBeVisible();

    await warden.getByRole('button', { name: 'Start a fight' }).click();
    await expect(warden.getByTestId('turn')).toContainText('Round 1');
    await expect(warden.getByTestId('turn')).toContainText('Players who made their Dexterity save');
    const adding = warden.getByRole('form', { name: 'Add enemies' });
    await adding
      .getByLabel('Creature')
      .selectOption({ label: 'Bandit (HP 4, sword (d8) or bow (d6))' });
    await adding.getByLabel('How many?').fill('2');
    await adding.getByRole('button', { name: 'Add to the fight' }).click();
    const one = warden.getByTestId('enemy-Bandit 1');
    await expect(one).toContainText('HP 4 of 4 · Armor 1 · Strength 10');
    await expect(warden.getByTestId('enemy-Bandit 2')).toBeVisible();
    await check(warden);

    // Turn order: nobody made the save, so the enemies go, then the players.
    await warden.getByRole('button', { name: 'Next turn' }).click();
    await expect(warden.getByTestId('turn')).toContainText('The enemies');
    await warden.getByRole('button', { name: 'Next turn' }).click();
    await expect(warden.getByTestId('turn')).toContainText(
      'Players who failed their Dexterity save',
    );
    await warden.getByRole('button', { name: 'Next turn' }).click();
    await expect(warden.getByTestId('turn')).toContainText('Round 2');

    // Distance, then damage: Armor 1 stops one point.
    await warden.getByLabel('Distance of Bandit 1').selectOption('close');
    await warden.getByLabel('Damage to Bandit 1', { exact: true }).fill('3');
    await warden.getByRole('button', { name: 'Apply damage to Bandit 1' }).click();
    await expect(warden.getByText('Bandit 1 takes 2. HP 2 of 4.')).toBeVisible();
    await expect(one).toContainText('HP 2 of 4');

    // Past HP into Strength: a Strength save, failed. The first has fallen, so morale is checked.
    await warden.getByLabel('Damage to Bandit 1', { exact: true }).fill('6');
    await warden.getByRole('button', { name: 'Apply damage to Bandit 1' }).click();
    await expect(one).toContainText('Strength 7 of 10');
    await warden.getByLabel(/^Strength save for Bandit 1/).fill('15');
    await warden.getByRole('button', { name: 'Make the save' }).click();
    await expect(one).toContainText('Down');
    const morale = warden.getByRole('group', { name: 'Morale check' });
    await expect(morale).toContainText('The first of them has fallen.');
    await expect(morale).toContainText('roll 8 or less');
    await check(warden);
    await morale.getByLabel(/^Willpower save/).fill('12');
    await morale.getByRole('button', { name: 'Check morale' }).click();
    await expect(warden.getByText(/They lose their nerve/)).toBeVisible();
    await expect(morale).toHaveCount(0);

    // The fight is remembered across a reload, and ends when the Warden says.
    await warden.reload();
    await expect(warden.getByTestId('enemy-Bandit 1')).toContainText('Down');
    await expect(warden.getByLabel('Distance of Bandit 1')).toHaveCount(0);
    await warden.getByRole('button', { name: 'End the fight' }).click();
    await expect(warden.getByRole('button', { name: 'Start a fight' })).toBeVisible();
  });

  test('the Warden makes an Origin, an Ability, a creature and gear; a player builds a character with them', async ({
    page: warden,
    browser,
  }) => {
    const { player } = await table(warden, browser);
    await openTab(warden, 'Workshop');

    // An Origin, with the rulebook's advice shown as it is written.
    await warden.getByRole('button', { name: 'New Origin' }).click();
    const origin = warden.getByRole('form', { name: 'New Origin' });
    await origin.getByLabel('Origin name').fill('Riverfolk');
    await origin.getByLabel('+1 to').selectOption('dex');
    await origin.getByLabel('Trait').fill('You have 2 extra HP.');
    await expect(origin.getByRole('status', { name: 'Advice from the rulebook' })).toContainText(
      'better at fighting',
    );
    await origin.getByLabel('Trait').fill('You swim as fast as you walk.');
    await expect(origin.getByRole('status', { name: 'Advice from the rulebook' })).toHaveCount(0);
    await origin.getByLabel('Item 1', { exact: true }).fill('Fishing spear');
    await origin.getByLabel('Item 1 Kind').selectOption('weapon');
    await origin.getByLabel('Item 1 damage').selectOption('8');
    await origin.getByLabel('Item 2', { exact: true }).fill('Oilskin bag');
    await check(warden);
    await origin.getByRole('button', { name: 'Save Origin' }).click();
    await expect(warden.getByText('Riverfolk saved.')).toBeVisible();

    // An Ability, added to one of the rulebook's Affinities.
    await warden.getByRole('button', { name: 'New Ability' }).click();
    const ability = warden.getByRole('form', { name: 'New Ability' });
    await ability
      .getByRole('combobox', { name: 'Affinity', exact: true })
      .selectOption({ label: 'Mending' });
    await ability.getByLabel('Ability name').fill('Stitch');
    await ability.getByLabel('What it does').fill('Strike one target that is Near for d12 damage.');
    await expect(ability.getByRole('status', { name: 'Advice from the rulebook' })).toContainText(
      'd6 or d8',
    );
    await ability
      .getByLabel('What it does')
      .fill('Close a wound you can touch so that it stops bleeding.');
    await ability.getByRole('button', { name: 'Save Ability' }).click();
    await expect(warden.getByText('Stitch saved.')).toBeVisible();

    // A creature, which then appears in the fight tracker.
    await warden.getByRole('button', { name: 'New creature' }).click();
    const creature = warden.getByRole('form', { name: 'New creature' });
    await creature.getByLabel('Creature name').fill('Mud Lurker');
    await creature.getByLabel('HP').fill('6');
    await creature.getByLabel('Attack', { exact: true }).fill('Bite');
    await creature.getByLabel('Attack damage').selectOption('10');
    await expect(creature.getByRole('status', { name: 'Advice from the rulebook' })).toContainText(
      'plenty of warning',
    );
    await creature
      .getByLabel(/What makes it memorable/)
      .fill('The water goes still before it strikes.');
    await check(warden);
    await creature.getByRole('button', { name: 'Save creature' }).click();
    await expect(warden.getByText(/Mud Lurker saved/)).toBeVisible();

    // Gear.
    await warden.getByRole('button', { name: 'New item' }).click();
    const gear = warden.getByRole('form', { name: 'New gear' });
    await gear.getByLabel('Item name').fill('Tide hook');
    await gear.getByLabel('Damage').selectOption('10');
    await expect(gear.getByRole('status', { name: 'Advice from the rulebook' })).toContainText(
      'should be bulky',
    );
    await gear.getByLabel(/^Bulky/).check();
    await expect(gear.getByRole('status', { name: 'Advice from the rulebook' })).toHaveCount(0);
    await gear.getByRole('button', { name: 'Save item' }).click();
    await expect(warden.getByText(/Tide hook saved/)).toBeVisible();

    // All of it saved as a world, to use in another campaign.
    const world = warden.getByRole('form', { name: 'Save as a world' });
    await world.getByLabel('World name').fill('The Drowned Lands');
    await world.getByRole('button', { name: /Save this campaign/ }).click();
    await expect(warden.getByText('The Drowned Lands saved as a world.')).toBeVisible();
    await expect(
      warden.getByRole('button', { name: 'Bring The Drowned Lands into this campaign' }),
    ).toBeVisible();
    await check(warden);

    // The player builds a character for this campaign with the new Origin and Ability.
    await player.getByRole('link', { name: 'Make one' }).click();
    const next = () => player.getByRole('button', { name: 'Next' }).click();
    await player.getByLabel('Strength').fill('9');
    await player.getByLabel('Dexterity').fill('13');
    await player.getByLabel('Willpower').fill('11');
    await next();
    await player.getByLabel('Hit Protection').fill('4');
    await next();
    await player.getByLabel('Name', { exact: true }).fill('Orla');
    await player.getByLabel('Background').fill('Ferryman');
    await next();
    await player.getByRole('radio', { name: /Riverfolk/ }).check();
    await check(player);
    await next();
    await player.getByLabel(/^Yes\./).check();
    await player.getByRole('combobox').selectOption('mending');
    await player.getByRole('checkbox', { name: /^Mend\./ }).check();
    await player.getByRole('checkbox', { name: /^Stitch\./ }).check();
    await next();
    await player.getByLabel('Coins').fill('10');
    await player.getByRole('button', { name: 'Finish character' }).click();

    await expect(player.getByRole('heading', { name: 'Orla', level: 1 })).toBeVisible();
    await expect(player.getByText('Ferryman · Riverfolk · Tier 1')).toBeVisible();
    await expect(player.getByText('You swim as fast as you walk.')).toBeVisible();
    await expect(stat(player, 'dexterity')).toHaveText('14');
    await expect(player.getByText('Fishing spear')).toBeVisible();
    await expect(
      player.getByText('Close a wound you can touch so that it stops bleeding.'),
    ).toBeVisible();
    await check(player);

    // The character is in the campaign at once, and the Warden can give it the world's gear.
    // At laptop width the party is always in view and has no tab.
    if (await warden.getByRole('tab', { name: 'Party' }).count()) await openTab(warden, 'Party');
    await expect(warden.getByTestId('summary-Orla')).toContainText('played by Sam');
    await openTab(warden, 'Fight');
    await warden.getByRole('button', { name: 'Start a fight' }).click();
    await expect(
      warden.getByRole('form', { name: 'Add enemies' }).getByRole('option', { name: /Mud Lurker/ }),
    ).toBeAttached();
  });
});
