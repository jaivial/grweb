import { test, expect } from '@playwright/test';
import { loginViaApi } from '../shared/auth.helpers';
import { monitorConsole } from '../shared/console-monitor';

test.describe('Backoffice Sorteo', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto('/backoffice/sorteo');
    await page.waitForLoadState('networkidle');
  });

  test('displays page header', async ({ page }) => {
    await expect(page.locator('h1:text("Sorteo")')).toBeVisible({ timeout: 10000 });
  });

  test('displays coming soon placeholder', async ({ page }) => {
    await expect(page.locator('text=Próximamente')).toBeVisible();
  });

  test('back to home link works', async ({ page }) => {
    await page.click('text=Volver al inicio');
    await expect(page).toHaveURL(/\/backoffice/, { timeout: 10000 });
  });

  test('no console errors', async ({ page }) => {
    const monitor = monitorConsole(page);
    await page.reload();
    await page.waitForLoadState('networkidle');
    monitor.assertNoErrors();
  });
});
