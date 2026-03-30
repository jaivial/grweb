import { test, expect } from '@playwright/test';
import { loginViaApi } from '../shared/auth.helpers';
import { monitorConsole } from '../shared/console-monitor';

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('networkidle');
    // Wait for the page to fully render
    await page.waitForTimeout(1000);
  });

  test('loads and displays statistics', async ({ page }) => {
    // Wait for the page to be fully loaded with statistics
    await page.waitForFunction(() => {
      return document.body.innerText.includes('Total Participants');
    }, { timeout: 15000 });
    await expect(page.locator('text=Total Participants')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Total Tickets Sold')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Total Revenue')).toBeVisible({ timeout: 5000 });
  });

  test('displays last updated time', async ({ page }) => {
    await expect(page.locator('text=Last updated:')).toBeVisible({ timeout: 10000 });
  });

  test('logout button redirects to login', async ({ page }) => {
    // Wait for dashboard to load first
    await page.waitForFunction(() => {
      return document.body.innerText.includes('Total Participants');
    }, { timeout: 15000 });
    await page.click('button:has-text("Logout")', { timeout: 10000 });
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 10000 });
  });

  test('no console errors during interaction', async ({ page }) => {
    const monitor = monitorConsole(page);
    await page.reload();
    await page.waitForLoadState('networkidle');
    monitor.assertNoErrors();
  });
});
