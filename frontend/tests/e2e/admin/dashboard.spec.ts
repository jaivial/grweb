import { test, expect } from '@playwright/test';
import { loginViaApi } from '../shared/auth.helpers';
import { monitorConsole } from '../shared/console-monitor';

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto('/backoffice');
    await page.waitForLoadState('domcontentloaded');
  });

  test('loads and displays statistics', async ({ page }) => {
    // Wait for KPI cards to render
    await expect(page.locator('text=Participantes').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Tickets Vendidos')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Recaudacion')).toBeVisible({ timeout: 5000 });
  });

  test('logout button redirects to login', async ({ page }) => {
    await expect(page.locator('button:has-text("Cerrar Sesion")')).toBeVisible({ timeout: 15000 });
    await page.click('button:has-text("Cerrar Sesion")', { timeout: 10000 });
    await expect(page).toHaveURL(/\/backoffice\/login/, { timeout: 10000 });
  });

  test('no console errors during interaction', async ({ page }) => {
    const monitor = monitorConsole(page);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    monitor.assertNoErrors();
  });
});
