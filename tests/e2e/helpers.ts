import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

export async function expectNoSeriousAccessibilityIssues(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes[0]?.target})`)).toEqual([]);
}

export async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

export async function signInAsGuest(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue as a guest' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, guest' })).toBeVisible();
}

const next = (page: Page) => page.getByRole('button', { name: 'Next' }).click();

/**
 * Builds Wren, the rulebook's example character, by typing in fixed rolls:
 * Strength 9, Dexterity 13, Willpower 11, 4 HP, and a kit roll of 3, 4, 1.
 * `check` runs on each step, for accessibility and layout checks.
 */
export async function buildWren(
  page: Page,
  check: (step: string) => Promise<void> = async () => {},
) {
  await page.getByRole('link', { name: 'Make a character' }).click();

  await page.getByLabel('Strength').fill('9');
  await page.getByLabel('Dexterity').fill('13');
  await page.getByLabel('Willpower').fill('11');
  await check('attributes');
  await next(page);

  await page.getByLabel('Hit Protection').fill('4');
  await check('hit protection');
  await next(page);

  await page.getByLabel('Name', { exact: true }).fill('Wren');
  await page.getByLabel('Background').fill('Scout');
  await check('background');
  await next(page);

  await page.getByRole('radio', { name: /No Origin/ }).check();
  await check('origin');
  await next(page);

  await page.getByLabel(/^Yes\./).check();
  await page.getByRole('combobox').selectOption('mending');
  await page.getByRole('checkbox', { name: /^Mend\./ }).check();
  await page.getByRole('checkbox', { name: /^Cleanse\./ }).check();
  await check('affinity');
  await next(page);

  await page.getByLabel('Coins').fill('10');
  await page.getByLabel('Weapon').fill('3');
  await page.getByLabel('Armor').fill('4');
  await page.getByLabel('Tools').fill('1');
  await check('gear');
  await page.getByRole('button', { name: 'Finish character' }).click();
  await expect(page.getByRole('heading', { name: 'Wren', level: 1 })).toBeVisible();
}

export const stat = (page: Page, name: string) => page.getByTestId(`stat-${name}`);

/** Reads a document straight from the Firestore emulator, past the security rules. */
export async function readFromEmulator(request: APIRequestContext, path: string) {
  const response = await request.get(
    `http://127.0.0.1:8080/v1/projects/demo-waymark/databases/(default)/documents/${path}`,
    { headers: { Authorization: 'Bearer owner' } },
  );
  return { status: response.status(), body: response.ok() ? await response.json() : null };
}
