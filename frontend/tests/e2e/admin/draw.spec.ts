import { test, expect } from '@playwright/test';
import { loginViaApi } from '../shared/auth.helpers';
import { monitorConsole } from '../shared/console-monitor';

test.describe('Admin Draw', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto('/backoffice/sorteo');
    await page.waitForLoadState('domcontentloaded');
  });

  test('displays draw page', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Sorteo' })).toBeVisible({ timeout: 15000 });
  });

  test('draw button or winner card is visible', async ({ page }) => {
    const drawSection = page.locator('h2').filter({ hasText: 'Listo para sortear?' });
    await expect(drawSection.first()).toBeVisible({ timeout: 15000 });
  });

  test('select winner button is visible', async ({ page }) => {
    await expect(page.locator('button:has-text("Seleccionar Ganador")')).toBeVisible({ timeout: 15000 });
  });

  test('no console errors', async ({ page }) => {
    const monitor = monitorConsole(page);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    monitor.assertNoErrors();
  });
});
