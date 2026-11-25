import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  buildWren,
  expectNoSeriousAccessibilityIssues,
  expectNoSidewaysScroll,
  joinWithCode,
  signInAsAccount,
  signInAsGuest,
  startCampaign,
} from '../helpers';

const CAMPAIGN = 'The Rope Bridge';

/** A separate browser session: its own sign-in, its own device. */
async function newDevice(browser: Browser): Promise<Page> {
  const context = await browser.newContext(test.info().project.use);
  return context.newPage();
}

/** Builds a character the Warden will run, from the campaign page. */
async function addWardenCharacter(page: Page, name: string) {
  await page.getByRole('link', { name: 'Add a character you run' }).click();
  await page.getByLabel('Strength').fill('10');
  await page.getByLabel('Dexterity').fill('12');
  await page.getByLabel('Willpower').fill('9');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Hit Protection').fill('3');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Background').fill('Hunter');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radio', { name: /Climber/ }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel(/^No\./).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Coins').fill('7');
  await page.getByRole('button', { name: 'Finish character' }).click();
  await expect(page.getByTestId(`summary-${name}`)).toContainText('run by the Warden');
}

// Several devices in one test take longer than a single-device flow.
test.describe.configure({ timeout: 120_000 });

test.describe('phase 3: gathering in a campaign', () => {
  test('a Warden, an account holder and a guest each see what they should', async ({
    page: warden,
    browser,
  }) => {
    // The Warden starts a campaign.
    await signInAsAccount(warden, 'Dana');
    const code = await startCampaign(warden, CAMPAIGN, 'Dana');
    await expect(warden.getByText('You are the Warden')).toBeVisible();
    await expect(warden.getByRole('img', { name: /QR code/ })).toBeVisible();
    await expectNoSeriousAccessibilityIssues(warden);
    await expectNoSidewaysScroll(warden);

    // An account holder makes a character, joins with the code, and brings the character in.
    const sam = await newDevice(browser);
    await signInAsAccount(sam, 'Sam');
    await buildWren(sam);
    const wrenUrl = sam.url();
    await sam.getByRole('link', { name: /All characters/ }).click();
    await joinWithCode(sam, code, 'Sam', CAMPAIGN);
    await sam.getByRole('button', { name: 'Bring Wren in' }).click();
    await expect(sam.getByTestId('summary-Wren')).toContainText('played by Sam');
    await expectNoSeriousAccessibilityIssues(sam);

    // A guest follows the join link while signed out, signs in as a guest, and lands on the join form.
    const jo = await newDevice(browser);
    await jo.goto(`/join/${code}`);
    await jo.getByRole('button', { name: 'Continue as a guest' }).click();
    await expect(jo.getByRole('heading', { name: 'Join a campaign', level: 1 })).toBeVisible();
    await expect(jo.getByLabel('Join code')).toHaveValue(code);
    await jo.getByLabel('Your name').fill('Jo');
    await jo.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(jo.getByRole('heading', { name: CAMPAIGN, level: 1 })).toBeVisible();

    // The Warden adds a character to run for someone with no device.
    await addWardenCharacter(warden, 'Pip');

    // Everyone sees both summaries, with HP.
    for (const device of [warden, sam, jo]) {
      await expect(device.getByTestId('summary-Wren')).toContainText('HP 4 of 4');
      await expect(device.getByTestId('summary-Pip')).toContainText('HP 3 of 3');
    }
    // Only the Warden can open the Warden-run character or see the join code.
    await expect(warden.getByRole('link', { name: 'Open' })).toHaveCount(1);
    for (const device of [sam, jo]) {
      await expect(device.getByRole('link', { name: 'Open' })).toHaveCount(0);
      await expect(device.getByTestId('join-code')).toHaveCount(0);
    }

    // A change to Wren reaches the others' summaries.
    await sam.goto(wrenUrl);
    await sam.getByRole('button', { name: 'Lower Hit Protection by 1' }).click();
    await expect(warden.getByTestId('summary-Wren')).toContainText('HP 3 of 4');
    await expect(jo.getByTestId('summary-Wren')).toContainText('HP 3 of 4');

    // Another player cannot open Wren's full sheet, even with its address.
    await jo.goto(wrenUrl);
    await expect(jo.getByRole('heading', { name: 'No such character' })).toBeVisible();

    // Sam lets the Warden change the sheet directly; the Warden sees the choice.
    await sam.goto(wrenUrl);
    await sam.getByRole('link', { name: /All characters/ }).click();
    await sam.getByRole('link', { name: new RegExp(CAMPAIGN) }).click();
    await expect(sam.getByLabel(/^Ask me first/)).toBeChecked();
    await sam.getByLabel(/^Directly/).check();
    await expect(warden.getByText('player · Warden may change their sheet')).toBeVisible();
  });

  test('a bad join code is refused with a clear message', async ({ page }) => {
    await signInAsGuest(page);
    await page.getByRole('button', { name: 'Join with a code' }).click();
    await page.getByLabel('Join code').fill('ZZZZZZ');
    await page.getByLabel('Your name').fill('Jo');
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('No campaign has that code');
  });

  test('a free account cannot start a second campaign', async ({ page }) => {
    await signInAsAccount(page, 'Dana');
    await startCampaign(page, CAMPAIGN, 'Dana');
    await page.getByRole('link', { name: /Home/ }).click();
    await page.getByRole('button', { name: 'Start a campaign' }).click();
    await page.getByLabel('Campaign name').fill('A second one');
    await page.getByRole('button', { name: 'Start campaign' }).click();
    await expect(page.getByRole('alert')).toContainText('A free account can run one campaign');
  });
});

test.describe('phase 3: handing over and keeping', () => {
  test('a guest takes over a Warden-run character, then creates an account and keeps everything', async ({
    page: warden,
    browser,
  }) => {
    await signInAsAccount(warden, 'Dana');
    await startCampaign(warden, CAMPAIGN, 'Dana');
    await addWardenCharacter(warden, 'Pip');

    // The Warden can open and change the character they run.
    await warden.getByRole('link', { name: 'Open' }).click();
    await expect(warden.getByRole('heading', { name: 'Pip', level: 1 })).toBeVisible();
    await warden.getByRole('button', { name: 'Add 1 Fatigue' }).click();
    await expect(warden.getByTestId('fatigue')).toHaveText('1');
    await warden.getByRole('link', { name: new RegExp(CAMPAIGN) }).click();

    await warden.getByRole('button', { name: 'Act on Pip' }).click();
    await warden.getByRole('button', { name: 'Hand this character to a player' }).click();
    const handover = (await warden.getByTestId('handover-code').textContent())!.trim();

    // The guest redeems the code and now owns Pip, Fatigue and all.
    const jo = await newDevice(browser);
    await signInAsGuest(jo);
    await jo.getByRole('button', { name: 'I have a hand-over code' }).click();
    await jo.getByLabel('Hand-over code').fill(handover);
    await jo.getByLabel('Your name').fill('Jo');
    await jo.getByRole('button', { name: 'Take over' }).click();
    await expect(jo.getByRole('heading', { name: 'Pip', level: 1 })).toBeVisible();
    await expect(jo.getByTestId('fatigue')).toHaveText('1');
    // Summaries settle within moments of a hand-over; wait for the settled list.
    await expect(warden.getByTestId('summary-Pip')).toHaveCount(1);
    await expect(warden.getByTestId('summary-Pip')).toContainText('played by Jo');
    await expect(warden.getByRole('link', { name: 'Open' })).toHaveCount(0);

    // The code cannot be used again.
    const sam = await newDevice(browser);
    await signInAsGuest(sam);
    await sam.getByRole('button', { name: 'I have a hand-over code' }).click();
    await sam.getByLabel('Hand-over code').fill(handover);
    await sam.getByLabel('Your name').fill('Sam');
    await sam.getByRole('button', { name: 'Take over' }).click();
    await expect(sam.getByRole('alert')).toContainText('already been used');

    // The guest creates an account and keeps the character and the campaign.
    await jo.getByRole('link', { name: /All characters/ }).click();
    await expect(jo.getByText('You are playing as a guest.')).toBeVisible();
    await jo.evaluate(() =>
      window.__waymarkTest!.linkGuestToGoogle('Jo Harper', `jo-${Date.now()}@example.com`),
    );
    await expect(jo.getByRole('heading', { name: 'Welcome, Jo Harper' })).toBeVisible();
    await expect(jo.getByText('You are playing as a guest.')).toHaveCount(0);
    await expect(jo.getByRole('link', { name: /Pip/ })).toBeVisible();
    await expect(jo.getByRole('link', { name: new RegExp(CAMPAIGN) })).toBeVisible();
    await jo.reload();
    await expect(jo.getByRole('link', { name: /Pip/ })).toBeVisible();
  });
});

test.describe('phase 3: leaving, removing and deleting', () => {
  test('a player leaves, another is removed, and the Warden deletes the campaign', async ({
    page: warden,
    browser,
  }) => {
    await signInAsAccount(warden, 'Dana');
    const code = await startCampaign(warden, CAMPAIGN, 'Dana');

    const sam = await newDevice(browser);
    await signInAsAccount(sam, 'Sam');
    await buildWren(sam);
    await sam.getByRole('link', { name: /All characters/ }).click();
    await joinWithCode(sam, code, 'Sam', CAMPAIGN);
    await sam.getByRole('button', { name: 'Bring Wren in' }).click();
    await expect(warden.getByTestId('summary-Wren')).toBeVisible();

    const jo = await newDevice(browser);
    await signInAsGuest(jo);
    await joinWithCode(jo, code, 'Jo', CAMPAIGN);
    await expect(warden.getByText('Jo', { exact: true })).toBeVisible();

    // Sam leaves: gone from the list, and Wren's summary goes too. Wren is still Sam's.
    await sam.getByRole('button', { name: 'Leave this campaign' }).click();
    await sam.getByRole('button', { name: 'Yes, leave' }).click();
    await expect(sam.getByText('You are not in a campaign yet.')).toBeVisible();
    await expect(sam.getByRole('link', { name: /Wren/ })).toBeVisible();
    await expect(warden.getByText('Sam', { exact: true })).toHaveCount(0);
    await expect(warden.getByTestId('summary-Wren')).toHaveCount(0);

    // The Warden removes Jo, who is shown the campaign is no longer theirs.
    await warden.getByRole('button', { name: 'Remove Jo' }).click();
    await expect(warden.getByText('Jo', { exact: true })).toHaveCount(0);
    await expect(jo.getByRole('heading', { name: 'No such campaign' })).toBeVisible();

    // The Warden deletes the campaign and can then start another.
    await warden.getByRole('button', { name: 'Delete this campaign' }).click();
    await warden.getByRole('button', { name: 'Yes, delete' }).click();
    await expect(warden.getByText('You are not in a campaign yet.')).toBeVisible();
    await startCampaign(warden, 'A new start', 'Dana');
  });
});
