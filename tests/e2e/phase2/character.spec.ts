import { expect, test } from '@playwright/test';
import {
  buildWren,
  expectNoSeriousAccessibilityIssues,
  expectNoSidewaysScroll,
  readFromEmulator,
  signInAsGuest,
  stat,
} from '../helpers';

test.describe('phase 2: making a character', () => {
  test('builds Wren from typed-in rolls, with every step accessible and fitting the screen', async ({
    page,
  }) => {
    await signInAsGuest(page);
    await expectNoSeriousAccessibilityIssues(page);
    await buildWren(page, async () => {
      await expectNoSeriousAccessibilityIssues(page);
      await expectNoSidewaysScroll(page);
    });

    // The rulebook's numbers for Wren.
    await expect(stat(page, 'strength')).toHaveText('9');
    await expect(stat(page, 'dexterity')).toHaveText('13');
    await expect(stat(page, 'willpower')).toHaveText('11');
    await expect(stat(page, 'hp')).toHaveText('4');
    await expect(page.getByTestId('armor')).toHaveText('1');
    await expect(page.getByTestId('slots')).toHaveText('6 of 10 slots');
    await expect(page.getByText('Standard weapon')).toBeVisible();
    await expect(page.getByText('Grappling hook')).toBeVisible();
    await expect(page.getByText('Mend', { exact: true })).toBeVisible();
    await expectNoSeriousAccessibilityIssues(page);
    await expectNoSidewaysScroll(page);
    await page.screenshot({
      path: `test-results/screens/sheet-${test.info().project.name}.png`,
      fullPage: true,
    });
  });

  test('the character is saved, survives a reload, and appears on the home screen', async ({
    page,
    request,
  }) => {
    await signInAsGuest(page);
    await buildWren(page);
    const id = page.url().split('/c/')[1]!;

    await expect
      .poll(async () => (await readFromEmulator(request, `characters/${id}`)).status)
      .toBe(200);
    const saved = (await readFromEmulator(request, `characters/${id}`)).body;
    expect(saved.fields.name.stringValue).toBe('Wren');
    expect(saved.fields.slot.integerValue).toBe('1');

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Wren', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: /All characters/ }).click();
    await expect(page.getByRole('link', { name: /Wren/ })).toBeVisible();
  });

  test('a free account is offered no second character', async ({ page }) => {
    await signInAsGuest(page);
    await buildWren(page);
    await page.getByRole('link', { name: /All characters/ }).click();
    await expect(page.getByText('A free account holds one character.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Make a character' })).toHaveCount(0);
  });

  test('a half-made character is still there after leaving and coming back', async ({ page }) => {
    await signInAsGuest(page);
    await page.getByRole('link', { name: 'Make a character' }).click();
    await page.getByLabel('Strength').fill('15');
    await page.goto('/');
    await page.getByRole('link', { name: 'Make a character' }).click();
    await expect(page.getByLabel('Strength')).toHaveValue('15');
  });
});

test.describe('phase 2: the sheet in play', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsGuest(page);
    await buildWren(page);
  });

  test('damage through 0 HP into Strength asks for a Strength save', async ({ page }) => {
    await page.getByRole('button', { name: 'Take damage' }).click();
    const dialog = page.getByRole('dialog');
    await expectNoSeriousAccessibilityIssues(page);
    await dialog.getByLabel('Damage rolled against you').fill('7');
    await dialog.getByRole('button', { name: 'Apply damage' }).click();

    await expect(stat(page, 'hp')).toHaveText('0');
    await expect(stat(page, 'strength')).toHaveText('7');
    await expect(page.getByRole('dialog', { name: 'Strength save' })).toBeVisible();
    await page.getByLabel('Your roll').fill('15');
    await page.getByRole('button', { name: 'Resolve' }).click();
    await expect(page.getByRole('alert')).toContainText('Critical damage');
  });

  test('damage to exactly 0 HP asks for a Scar', async ({ page }) => {
    await page.getByRole('button', { name: 'Take damage' }).click();
    await page.getByLabel('Damage rolled against you').fill('5');
    await page.getByRole('button', { name: 'Apply damage' }).click();
    await expect(page.getByRole('dialog', { name: 'Roll a Scar' })).toBeVisible();
    await page.getByRole('spinbutton', { name: /^Scar/ }).fill('2');
    await page.getByLabel('Roll for the scar').fill('6');
    await page.getByRole('button', { name: 'Record scar' }).click();
    await expect(page.locator('.scars').getByText('Rattling Blow')).toBeVisible();
    await expect(page.getByText('of 6')).toBeVisible();
  });

  test('an Ability used in danger with a failed save misfires', async ({ page }) => {
    await page.getByRole('button', { name: 'Use' }).first().click();
    await page.getByLabel(/^Yes\./).check();
    await page.getByLabel('Willpower save').fill('15');
    await expect(page.getByText('The save failed. The Ability misfires.')).toBeVisible();
    await page.getByLabel('Misfire').fill('2');
    await expectNoSeriousAccessibilityIssues(page);
    await page.getByRole('button', { name: 'Use Ability' }).click();
    await expect(page.getByRole('status')).toContainText('Mend misfired: Drained');
    await expect(page.getByTestId('fatigue')).toHaveText('2');
  });

  test('filling every slot drops HP to 0, and resting after dropping something brings it back', async ({
    page,
  }) => {
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Add 1 Fatigue' }).click();
    await expect(page.getByTestId('slots')).toHaveText('10 of 10 slots');
    await expect(stat(page, 'hp')).toHaveText('0');
    await expect(page.getByRole('alert')).toContainText('Every slot is full');

    // Resting while overloaded does nothing.
    await page.getByRole('button', { name: 'Rest', exact: true }).click();
    await page.getByRole('button', { name: /^Short rest/ }).click();
    await expect(stat(page, 'hp')).toHaveText('0');

    // A safe night clears the Fatigue and restores HP.
    await page.getByRole('button', { name: 'Rest', exact: true }).click();
    await page.getByRole('button', { name: /^Night's rest/ }).click();
    await expect(page.getByTestId('fatigue')).toHaveText('0');
    await expect(stat(page, 'hp')).toHaveText('4');
  });

  test('a change made offline is kept and reaches the server once back online', async ({
    page,
    context,
    request,
  }) => {
    const id = page.url().split('/c/')[1]!;
    await expect
      .poll(async () => (await readFromEmulator(request, `characters/${id}`)).status)
      .toBe(200);

    await context.setOffline(true);
    await page.getByRole('button', { name: 'Add 1 Fatigue' }).click();
    await page.getByRole('button', { name: 'Add 1 Fatigue' }).click();
    await expect(page.getByTestId('fatigue')).toHaveText('2');
    await expect(page.getByTestId('slots')).toHaveText('8 of 10 slots');

    await context.setOffline(false);
    await expect
      .poll(
        async () =>
          (await readFromEmulator(request, `characters/${id}`)).body?.fields.sheet.mapValue.fields
            .fatigue.integerValue,
        {
          timeout: 20_000,
        },
      )
      .toBe('2');
  });

  test('the dice roller and a save work from the sheet', async ({ page }) => {
    await page.getByRole('button', { name: 'Roll dice' }).click();
    await page.getByRole('button', { name: 'd20' }).click();
    await expect(
      page.getByRole('list', { name: 'Recent rolls' }).getByRole('listitem'),
    ).toHaveCount(1);
    await page.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: 'Make a save' }).click();
    await page.getByLabel('Dexterity save').fill('9');
    await expect(page.getByRole('dialog').getByRole('status')).toHaveText('9 against 13: success.');
  });

  test('deleting the character frees the slot for a new one', async ({ page }) => {
    await page.getByRole('button', { name: 'Delete this character' }).click();
    await page.getByRole('button', { name: 'Yes, delete' }).click();
    await expect(page.getByRole('link', { name: 'Make a character' })).toBeVisible();
  });
});
