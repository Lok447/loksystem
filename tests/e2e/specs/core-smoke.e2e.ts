/**
 * Core smoke coverage for the highest-value user paths.
 *
 * Goal: provide a small, stable Playwright suite that can run locally or in CI
 * to confirm the app still boots and the main shell routes remain usable.
 */
import { test, expect } from '../fixtures';
import { goToGuid, goToSettings, waitForSettle } from '../helpers/navigation';
import { AGENT_BADGE, AGENT_PILL, CHAT_INPUT } from '../helpers/selectors';

test.describe('Core Smoke', () => {
  test('guid page renders primary input and agent selection', async ({ page }) => {
    await goToGuid(page);
    await expect(page.locator(CHAT_INPUT).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(AGENT_PILL).first()).toBeVisible({ timeout: 10_000 });
  });

  test('conversation shell opens from guid input flow', async ({ page }) => {
    await goToGuid(page);

    const input = page.locator(CHAT_INPUT).first();
    await input.click();
    await input.fill('core smoke navigation check');
    await input.press('Enter');

    await page
      .waitForFunction(() => window.location.hash.includes('/conversation/'), { timeout: 20_000 })
      .catch(() => {});

    expect(page.url()).toContain('/conversation/');
    await waitForSettle(page, 5_000);
    await expect(page.locator(AGENT_BADGE).first()).toBeVisible({ timeout: 10_000 });
  });

  test('settings core tabs remain reachable', async ({ page }) => {
    await goToSettings(page, 'agent');
    expect(page.url()).toContain('/settings/agent');

    await goToSettings(page, 'webui');
    expect(page.url()).toContain('/settings/webui');
  });
});
