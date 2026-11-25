import { expect, test, type Page } from '@playwright/test';
import {
  expectNoSeriousAccessibilityIssues,
  expectNoSidewaysScroll,
  signInAsAccount,
  signInAsGuest,
  startCampaign,
  writeToEmulator,
} from '../helpers';

// The local emulator answers with a stand-in model that gives fixed replies,
// so these tests need no real model and no key.
test.describe.configure({ timeout: 120_000 });

const openTab = (page: Page, name: string) => page.getByRole('tab', { name }).click();

async function check(page: Page) {
  await expectNoSeriousAccessibilityIssues(page);
  await expectNoSidewaysScroll(page);
}

test.describe('phase 7: AI help', () => {
  test('the Warden gets proposals, changes them, and nothing is saved until accepted', async ({
    page,
    request,
  }) => {
    await signInAsAccount(page, 'Dana');
    await startCampaign(page, 'The Drowned Valley', 'Dana');
    const uid = page.url().match(/\/k\/(.+)_1/)![1]!;
    await openTab(page, 'Workshop');

    // A creature: the proposal fills the form. It is not in the list until saved.
    const creatures = page.getByRole('region', { name: 'Creatures' });
    await creatures.getByLabel('Anything in mind?').fill('something in the reeds');
    await creatures.getByRole('button', { name: 'Suggest a creature' }).click();
    const form = page.getByRole('form', { name: 'New creature' });
    await expect(form.getByLabel('Creature name')).toHaveValue('Reed Stalker');
    await expect(form.getByLabel('HP')).toHaveValue('5');
    await expect(creatures.getByText('Suggested by AI.')).toBeVisible();
    await expect(creatures.getByText('1 of 30 AI requests used this month.')).toBeVisible();
    await expect(creatures.getByRole('listitem').filter({ hasText: 'Reed Stalker' })).toHaveCount(
      0,
    );
    await check(page);

    // The Warden changes it, then saves.
    await form.getByLabel('Creature name').fill('Reed Stalker Matriarch');
    await form.getByLabel('HP').fill('8');
    await form.getByRole('button', { name: 'Save creature' }).click();
    await expect(
      creatures.getByRole('listitem').filter({ hasText: 'Reed Stalker Matriarch' }),
    ).toContainText('HP 8');

    // A proposal can simply be dropped.
    const origins = page.getByRole('region', { name: 'Origins' });
    await origins.getByRole('button', { name: 'Suggest an Origin' }).click();
    await expect(
      page.getByRole('form', { name: 'New Origin' }).getByLabel('Origin name'),
    ).toHaveValue('Marshborn');
    await expect(
      page.getByRole('form', { name: 'New Origin' }).getByLabel('Item 1', { exact: true }),
    ).toHaveValue('Barbed spear');
    await page
      .getByRole('form', { name: 'New Origin' })
      .getByRole('button', { name: 'Cancel' })
      .click();
    await expect(origins.getByRole('listitem')).toHaveCount(0);

    // An Ability and an item, accepted as they are.
    await page
      .getByRole('region', { name: 'Abilities and Affinities' })
      .getByRole('button', { name: 'Suggest an Ability' })
      .click();
    const ability = page.getByRole('form', { name: 'New Ability' });
    await expect(ability.getByLabel('Ability name')).toHaveValue('Still Water');
    await expect(ability.getByRole('combobox', { name: 'Affinity', exact: true })).toHaveValue(
      'shaping',
    );
    await ability.getByRole('button', { name: 'Save Ability' }).click();
    await expect(page.getByText('Still Water saved.')).toBeVisible();
    await page
      .getByRole('region', { name: 'Gear' })
      .getByRole('button', { name: 'Suggest an item' })
      .click();
    await expect(page.getByRole('form', { name: 'New gear' }).getByLabel('Item name')).toHaveValue(
      'Storm Lantern',
    );
    await expect(
      page.getByRole('form', { name: 'New gear' }).getByLabel('Charges', { exact: true }),
    ).toHaveValue('2');
    await page
      .getByRole('form', { name: 'New gear' })
      .getByRole('button', { name: 'Save item' })
      .click();
    await expect(page.getByText(/Storm Lantern saved/)).toBeVisible();

    // A reply that cannot be used: a clear message, nothing saved, and the request is given back.
    await creatures.getByLabel('Anything in mind?').fill('broken');
    await creatures.getByRole('button', { name: 'Suggest a creature' }).click();
    await expect(creatures.getByRole('alert')).toContainText(
      'did not return something usable, so nothing was saved',
    );
    await expect(creatures.getByRole('listitem')).toHaveCount(1);

    // The story: a person for the cards, then a recap and filing from the timeline.
    await openTab(page, 'Story');
    await page.getByRole('button', { name: 'Suggest a person' }).click();
    const card = page.getByRole('form', { name: 'New card' });
    await expect(card.getByLabel('Name', { exact: true })).toHaveValue('Hesta Vole');
    await expect(card.getByLabel('Your private notes')).toHaveValue(/ledger records who crossed/);
    await expect(card.getByLabel('Status')).toHaveValue('planned');
    await card.getByRole('button', { name: 'Save card' }).click();
    await expect(page.getByTestId('card-Hesta Vole')).toContainText('Planned');

    const beat = page.getByRole('form', { name: 'Add a story beat' });
    await beat.getByLabel('What just happened?').fill('The bridge fell as they crossed.');
    await beat.getByRole('button', { name: 'Add to the timeline' }).click();
    await page.getByRole('button', { name: 'Recap the session' }).click();
    const recap = page.getByRole('group', { name: 'Suggested recap' });
    await expect(recap.getByLabel('Recap')).toHaveValue(
      /^The Fall of the Rope Bridge\. The party reached the gorge/,
    );
    const beats = page.getByRole('list', { name: /Story beats/ }).locator('li > p');
    await expect(beats).toHaveCount(1);
    await check(page);
    await recap.getByLabel('Recap').fill('The bridge fell. Nobody was lost.');
    await recap.getByRole('button', { name: 'Add the recap to the timeline' }).click();
    await expect(beats).toHaveCount(2);
    await expect(beats.first()).toHaveText('The bridge fell. Nobody was lost.');

    await page.getByRole('button', { name: 'Suggest filing' }).click();
    const filing = page.getByRole('group', { name: 'Suggested filing' });
    await expect(filing.getByText('Who cut the ropes?')).toBeVisible();
    await expect(filing.getByText('Hesta Vole')).toBeVisible();
    await expect(page.getByTestId('card-Who cut the ropes?')).toHaveCount(0);
    await check(page);
    await filing.getByRole('button', { name: 'Add a card for Who cut the ropes?' }).click();
    await expect(page.getByTestId('card-Who cut the ropes?')).toContainText('Planned');
    await filing.getByRole('button', { name: 'Skip the change to Hesta Vole' }).click();
    await expect(page.getByTestId('card-Hesta Vole')).toContainText('Planned');
    await expect(filing.getByRole('listitem')).toHaveCount(0);

    // The count on the Account page: six requests that worked, none for the one that failed.
    await page.getByRole('link', { name: '← Home' }).click();
    await page.getByRole('link', { name: 'Account' }).click();
    await expect(page.getByTestId('usage-ai')).toHaveText('AI help this month: 7 of 30 requests');

    // When the month's allowance is used up, the button says so.
    await writeToEmulator(request, `usage/${uid}`, {
      month: new Date().toISOString().slice(0, 7),
      ai: 30,
    });
    await expect(page.getByTestId('usage-ai')).toHaveText('AI help this month: 30 of 30 requests');
    await page.getByRole('link', { name: '← Home' }).click();
    await page.getByRole('link', { name: /The Drowned Valley/ }).click();
    await openTab(page, 'Workshop');
    await page
      .getByRole('region', { name: 'Creatures' })
      .getByRole('button', { name: 'Suggest a creature' })
      .click();
    await expect(page.getByRole('region', { name: 'Creatures' }).getByRole('alert')).toHaveText(
      'You have used all 30 AI requests for this month. They renew on the 1st.',
    );
  });

  test('anyone can ask the rulebook a question and get an answer with a link to the rule', async ({
    page,
  }) => {
    await signInAsGuest(page);
    const form = page.getByRole('form', { name: 'Ask the rulebook' });
    await expect(form.getByRole('button', { name: 'Ask' })).toBeDisabled();
    await form.getByLabel('Your question').fill('Who goes first in a fight?');
    await form.getByRole('button', { name: 'Ask' }).click();
    const answer = page.getByRole('status', { name: 'Answer' });
    await expect(answer).toContainText('Every player makes a Dexterity save.');
    await expect(
      answer.getByRole('link', { name: /Read the rule: Adventure and Danger: Fighting/ }),
    ).toHaveAttribute('href', 'https://waymark-rpg.web.app/rules/adventure-and-danger/#fighting');
    await check(page);

    // A question the rulebook has no words for costs nothing and says so.
    await form.getByLabel('Your question').fill('zeppelin xylophone');
    await form.getByRole('button', { name: 'Ask' }).click();
    await expect(answer).toContainText('I could not find anything in the rulebook about that.');
    await page.getByRole('link', { name: 'Account' }).click();
    await expect(page.getByTestId('usage-ai')).toHaveText('AI help this month: 1 of 5 requests');
  });
});
