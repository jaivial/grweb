import { test, expect } from '@playwright/test';
import { loginViaApi } from '../shared/auth.helpers';
import { monitorConsole } from '../shared/console-monitor';

test.describe('Backoffice Sorteo', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto('/backoffice/sorteo');
    await page.waitForLoadState('domcontentloaded');
  });

  test('displays page header', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Sorteo' })).toBeVisible({ timeout: 15000 });
  });

  test('displays draw ready section', async ({ page }) => {
    await expect(page.locator('text=Listo para sortear?')).toBeVisible();
  });

  test('can select winner button is visible', async ({ page }) => {
    await expect(page.locator('button:has-text("Seleccionar Ganador")')).toBeVisible();
  });

  test('no console errors', async ({ page }) => {
    const monitor = monitorConsole(page);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    monitor.assertNoErrors();
  });
});
