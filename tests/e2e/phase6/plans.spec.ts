import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  buildWren,
  expectNoSeriousAccessibilityIssues,
  expectNoSidewaysScroll,
  readFromEmulator,
  signInAsAccount,
  signInAsGuest,
  startCampaign,
  writeToEmulator,
} from '../helpers';

test.describe.configure({ timeout: 120_000 });

const home = (page: Page) => page.getByRole('link', { name: /Home|All characters/ }).click();

/** Stands in for the payment provider: sets the account's plan as the server would. */
const setPlan = (request: APIRequestContext, uid: string, plan: 'paid' | 'free') =>
  writeToEmulator(request, `entitlements/${uid}`, {
    plan,
    status: plan === 'paid' ? 'active' : 'none',
    period: plan === 'paid' ? 'monthly' : null,
    renewsAt: plan === 'paid' ? Date.UTC(2027, 0, 15) : null,
    eventAt: plan === 'paid' ? 1000 : 2000,
    customerId: 'cus_test',
    subscriptionId: plan === 'paid' ? 'sub_test' : null,
  });

test.describe('phase 6: plans', () => {
  test('free limits, a paid plan, what happens when it ends, export and deletion', async ({
    page,
    request,
  }) => {
    await signInAsAccount(page, 'Dana');
    await buildWren(page);
    const uid = page.url().match(/\/c\/(.+)_1$/)![1]!;
    await home(page);

    // Free: one character, and paying is not open yet.
    await page.getByRole('link', { name: 'Account' }).click();
    await expect(page.getByTestId('plan')).toContainText('Free plan.');
    await expect(page.getByTestId('usage-characters')).toHaveText('Your characters: 1 of 1');
    await expectNoSeriousAccessibilityIssues(page);
    await expectNoSidewaysScroll(page);
    await page.getByRole('button', { name: '$4.99 a month' }).click();
    await expect(page.getByText('Paid plans are not open yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: '$49.90 a year' })).toBeVisible();

    // The provider reports a subscription: the page changes without a reload.
    await setPlan(request, uid, 'paid');
    await expect(page.getByTestId('plan')).toContainText('Paid plan. Renews on January 15, 2027.');
    await expect(page.getByTestId('usage-characters')).toHaveText(
      'Your characters: 1, with no limit',
    );
    await expect(page.getByRole('button', { name: 'Change card or cancel' })).toBeVisible();

    // Paid: a second character and a second campaign.
    await home(page);
    await buildWren(page, undefined, 'Ash');
    expect(page.url()).toContain(`${uid}_2`);
    await home(page);
    await startCampaign(page, 'The Rope Bridge', 'Dana');
    await home(page);
    await startCampaign(page, 'The Drowned Valley', 'Dana');
    await home(page);

    // The plan ends. Nothing is deleted; the extras become read-only.
    await setPlan(request, uid, 'free');
    await expect(page.getByRole('link', { name: /Ash/ })).toContainText('Read-only');
    await expect(page.getByRole('link', { name: /Wren/ })).not.toContainText('Read-only');
    await page.getByRole('link', { name: /Ash/ }).click();
    await expect(page.getByText('Ash is read-only.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use' }).first()).toBeDisabled();
    await expectNoSeriousAccessibilityIssues(page);
    await expectNoSidewaysScroll(page);

    // The owner chooses to keep Ash and the second campaign instead.
    await page.getByRole('link', { name: /Choose which to keep/ }).click();
    await expect(page.getByTestId('usage-characters')).toHaveText('Your characters: 2 of 1');
    await expect(page.getByTestId('usage-campaigns')).toHaveText('Campaigns you run: 2 of 1');
    await expect(page.getByRole('radio', { name: 'Wren' })).toBeChecked();
    await expectNoSeriousAccessibilityIssues(page);
    await page.getByRole('radio', { name: 'Ash' }).check();
    await page.getByRole('radio', { name: 'The Drowned Valley' }).check();
    await home(page);
    await expect(page.getByRole('link', { name: /Wren/ })).toContainText('Read-only');
    await expect(page.getByRole('link', { name: /Ash/ })).not.toContainText('Read-only');
    await page.getByRole('link', { name: /Ash/ }).click();
    await expect(page.getByRole('button', { name: 'Use' }).first()).toBeEnabled();
    await expect(page.getByText('Ash is read-only.')).toHaveCount(0);
    await home(page);

    // The campaign not chosen can be read, and not changed.
    await page.getByRole('link', { name: /The Rope Bridge/ }).click();
    await expect(page.getByText('This campaign is read-only.')).toBeVisible();
    await page.getByRole('tab', { name: 'Story' }).click();
    await expect(page.getByRole('button', { name: 'Save the setting' })).toBeDisabled();
    await expectNoSeriousAccessibilityIssues(page);
    await home(page);
    await page.getByRole('link', { name: /The Drowned Valley/ }).click();
    await page.getByRole('tab', { name: 'Story' }).click();
    await expect(page.getByRole('button', { name: 'Save the setting' })).toBeEnabled();
    await home(page);

    // Export: one file with everything that is theirs.
    await page.getByRole('link', { name: 'Account' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export my data' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('waymark-my-data.json');
    const stream = await download.createReadStream();
    let file = '';
    for await (const chunk of stream) file += chunk;
    const data = JSON.parse(file) as {
      characters: { name: string }[];
      campaignsRun: { name: string }[];
    };
    expect(data.characters.map((c) => c.name).sort()).toEqual(['Ash', 'Wren']);
    expect(data.campaignsRun.map((c) => c.name).sort()).toEqual([
      'The Drowned Valley',
      'The Rope Bridge',
    ]);

    // Deletion: asks for a typed word, then removes everything.
    await page.getByRole('button', { name: 'Delete my account' }).click();
    await expect(page.getByRole('button', { name: 'Delete everything' })).toBeDisabled();
    await page.getByLabel('Type DELETE to confirm').fill('DELETE');
    await expectNoSeriousAccessibilityIssues(page);
    await page.getByRole('button', { name: 'Delete everything' }).click();
    await expect(page.getByRole('button', { name: 'Continue as a guest' })).toBeVisible();
    for (const path of [
      `characters/${uid}_1`,
      `characters/${uid}_2`,
      `campaigns/${uid}_1`,
      `campaigns/${uid}_2`,
      `entitlements/${uid}`,
    ]) {
      expect((await readFromEmulator(request, path)).status, path).toBe(404);
    }
  });

  test('a guest sees the free plan and is told an account is needed to pay', async ({ page }) => {
    await signInAsGuest(page);
    await page.getByRole('link', { name: 'Account' }).click();
    await expect(page.getByTestId('plan')).toContainText('Free plan.');
    await expect(page.getByText('To take a paid plan, first create an account')).toBeVisible();
    await expect(page.getByRole('button', { name: '$4.99 a month' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute(
      'href',
      'https://waymark-rpg.web.app/privacy/',
    );
    await expectNoSeriousAccessibilityIssues(page);
  });
});
