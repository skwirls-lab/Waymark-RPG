import { expect, test } from '@playwright/test';
import {
  expectNoSeriousAccessibilityIssues,
  expectNoSidewaysScroll,
  signInAsAccount,
  startCampaign,
  writeToEmulator,
} from '../helpers';

// The local emulator answers with a stand-in Warden that plays one small
// scene, so this needs no real model.
test.describe.configure({ timeout: 120_000 });

test('phase 8: an AI-run campaign, from switching it on to a save and its outcome', async ({
  page,
  request,
}) => {
  await signInAsAccount(page, 'Dana');
  await startCampaign(page, 'The Rope Bridge', 'Dana');
  const campaignUrl = page.url();
  const uid = campaignUrl.match(/\/k\/(.+)_1/)![1]!;

  // Without the AI Warden plan it is refused, and says why.
  await page.getByRole('button', { name: 'Let the AI run this campaign' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'An AI-run campaign needs the AI Warden plan.',
  );
  await expect(page.getByRole('tab', { name: 'Play' })).toHaveCount(0);

  // With the plan, the owner hands the campaign over.
  await writeToEmulator(request, `entitlements/${uid}`, { plan: 'ai-warden', status: 'active' });
  await page.getByRole('button', { name: 'Let the AI run this campaign' }).click();
  await expect(page.getByRole('tab', { name: 'Play' })).toBeVisible();

  // The owner makes a character to play in it.
  await page.getByRole('link', { name: 'Make one' }).click();
  const next = () => page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Strength').fill('9');
  await page.getByLabel('Dexterity').fill('13');
  await page.getByLabel('Willpower').fill('11');
  await next();
  await page.getByLabel('Hit Protection').fill('4');
  await next();
  await page.getByLabel('Name', { exact: true }).fill('Wren');
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
  await expect(page.getByRole('heading', { name: 'Wren', level: 1 })).toBeVisible();

  // Back to the campaign through the app, as a person would. (Loading the address afresh at
  // this instant could cut off the save of the character just made.)
  await page.getByRole('link', { name: /All characters/ }).click();
  await page.getByRole('link', { name: /The Rope Bridge/ }).click();
  // Wren is in the campaign once the server has the new character.
  await expect(page.getByTestId('summary-Wren')).toBeVisible();
  await page.getByRole('tab', { name: 'Play' }).click();
  await expect(page.getByText('The story has not started.')).toBeVisible();
  await expectNoSeriousAccessibilityIssues(page);
  await expectNoSidewaysScroll(page);

  // Speech can be turned off, and the story is all there in text either way.
  const aloud = page.getByRole('checkbox', { name: 'Read narration aloud' });
  if (await aloud.count()) await aloud.uncheck();

  // Typed input: the Warden answers.
  const story = page.getByRole('list', { name: 'The story so far' }).getByRole('listitem');
  const form = page.getByRole('form', { name: 'What do you do?' });
  await form.getByLabel('What do you do?').fill('Can we cross tonight?');
  await form.getByRole('button', { name: 'Send' }).click();
  await expect(story).toHaveCount(2);
  await expect(story.nth(0)).toContainText('Wren');
  await expect(story.nth(0)).toContainText('Can we cross tonight?');
  await expect(story.nth(1)).toContainText('The ferryman looks up.');

  // A suggestion is one tap.
  await expect(page.getByRole('group', { name: 'Suggestions' }).getByRole('button')).toHaveCount(2);
  await page.getByRole('button', { name: 'Look for another way across' }).click();
  await expect(story).toHaveCount(4);

  // Something risky: the Warden asks for a save, saying what is at stake. The player rolls.
  await form.getByLabel('What do you do?').fill('I jump the gap.');
  await form.getByRole('button', { name: 'Send' }).click();
  const roll = page.getByRole('group', { name: 'A roll is needed' });
  await expect(roll).toContainText(
    'Wren: Dexterity save. To clear the gap. Fail, and you fall short. Roll 13 or less.',
  );
  await expect(form).toHaveCount(0);
  await expectNoSeriousAccessibilityIssues(page);
  await roll.getByLabel(/^Your roll/).fill('4');
  await roll.getByRole('button', { name: 'Send the roll' }).click();

  // The rules give the result; the Warden narrates it.
  await expect(
    page.getByText('Wren rolled 4 for a Dexterity save against 13: passed.'),
  ).toBeVisible();
  await expect(story.last()).toContainText('You land on the far side, heart pounding.');
  await expect(roll).toHaveCount(0);
  await expect(form).toBeVisible();
  await expectNoSidewaysScroll(page);

  // The story is still there after a reload, and the owner can take the campaign back.
  await page.reload();
  await expect(story).toHaveCount(8);
  await page.getByRole('tab', { name: 'Party' }).click();
  await page.getByRole('button', { name: 'Run it myself again' }).click();
  await expect(page.getByRole('tab', { name: 'Play' })).toHaveCount(0);
});
