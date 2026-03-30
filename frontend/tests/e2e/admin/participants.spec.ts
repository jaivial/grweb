import { test, expect } from '@playwright/test';
import { loginViaApi } from '../shared/auth.helpers';
import { monitorConsole } from '../shared/console-monitor';

test.describe('Admin Participants', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto('/admin/participants');
    await page.waitForLoadState('networkidle');
  });

  test('displays participants page with search', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Participants');
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();
  });

  test('table or empty state is visible', async ({ page }) => {
    await expect(page.locator('table, [data-ui="table-container"]')).toBeVisible({ timeout: 5000 });
  });

  test('search input accepts text', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill('test');
    await page.waitForTimeout(500);
    await expect(searchInput).toHaveValue('test');
  });

  test('CSV export button is present', async ({ page }) => {
    await expect(page.locator('button:has-text("Export CSV")')).toBeVisible();
  });

  test('no console errors', async ({ page }) => {
    const monitor = monitorConsole(page);
    await page.reload();
    await page.waitForLoadState('networkidle');
    monitor.assertNoErrors();
  });
});
