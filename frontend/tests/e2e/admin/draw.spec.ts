import { test, expect } from '@playwright/test';
import { loginViaApi } from '../shared/auth.helpers';
import { monitorConsole } from '../shared/console-monitor';

test.describe('Admin Draw', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto('/admin/draw');
    await page.waitForLoadState('networkidle');
  });

  test('displays draw page', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Draw Winner', { timeout: 10000 });
  });

  test('draw button or winner card is visible', async ({ page }) => {
    // Look for either the "Ready to Draw?" heading or the "Randomly Select Winner" button
    const drawSection = page.locator('h2:has-text("Ready to Draw?"), button:has-text("Randomly Select Winner")');
    await expect(drawSection.first()).toBeVisible({ timeout: 10000 });
  });

  test('draw history section is visible', async ({ page }) => {
    await expect(page.locator('text=Draw History')).toBeVisible();
  });

  test('no console errors', async ({ page }) => {
    const monitor = monitorConsole(page);
    await page.reload();
    await page.waitForLoadState('networkidle');
    monitor.assertNoErrors();
  });
});
