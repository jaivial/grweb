import { test, expect } from '@playwright/test';
import { loginViaApi } from '../shared/auth.helpers';
import { monitorConsole } from '../shared/console-monitor';

test.describe('Admin Participants', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto('/backoffice/inscripciones');
    await page.waitForLoadState('domcontentloaded');
  });

  test('displays participants page with search', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Inscripciones' })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('input[placeholder*="Nombre"]')).toBeVisible();
  });

  test('table or empty state is visible', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 5000 });
  });

  test('search input accepts text', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Nombre"]');
    await searchInput.fill('test');
    await page.waitForTimeout(500);
    await expect(searchInput).toHaveValue('test');
  });

  test('PDF export button is present', async ({ page }) => {
    await expect(page.locator('button:has-text("Exportar PDF")')).toBeVisible();
  });

  test('no console errors', async ({ page }) => {
    const monitor = monitorConsole(page);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    monitor.assertNoErrors();
  });
});
