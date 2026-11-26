import { expect, test } from '@playwright/test';
import {
  buildWren,
  expectNoSeriousAccessibilityIssues,
  expectNoSidewaysScroll,
  signInAsGuest,
} from '../helpers';

test('the rules are a tap away during play: a quick reference, a search, and back to the sheet', async ({
  page,
}) => {
  await signInAsGuest(page);
  await buildWren(page);

  // From the sheet, mid-game.
  await page.getByRole('link', { name: 'Rules', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rules', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quick reference' })).toBeVisible();
  await expectNoSeriousAccessibilityIssues(page);
  await expectNoSidewaysScroll(page);

  // Looking something up finds the section that covers it.
  await page.getByLabel('Look something up').fill('who goes first in a fight');
  await page.getByRole('button', { name: 'Fighting' }).click();
  await expect(page.getByRole('heading', { name: 'Fighting', level: 2 })).toBeVisible();
  await expect(page.getByText('every player makes a')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open in the full rulebook' })).toHaveAttribute(
    'href',
    'https://waymark-rpg.web.app/rules/adventure-and-danger/#fighting',
  );
  await expectNoSeriousAccessibilityIssues(page);
  await expectNoSidewaysScroll(page);

  // Words the rulebook does not use say so.
  await page.getByLabel('Look something up').fill('zeppelin xylophone');
  await expect(page.getByText('Nothing in the rulebook uses those words.')).toBeVisible();

  // The whole book is there too, by chapter.
  await page.getByLabel('Look something up').fill('');
  await page.locator('summary', { hasText: 'Growing and Changing' }).click();
  await expect(page.getByRole('button', { name: /Tiers/ }).first()).toBeVisible();

  // And back to where the player was.
  await page.getByRole('button', { name: '← Back to the game' }).click();
  await expect(page.getByRole('heading', { name: 'Wren', level: 1 })).toBeVisible();
});
