import { test, expect } from '@playwright/test';
import { loginViaApi } from '../shared/auth.helpers';
import { monitorConsole } from '../shared/console-monitor';

test.describe('Backoffice Horarios', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto('/backoffice/horarios');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('displays page header', async ({ page }) => {
    await expect(page.locator('[data-ui="horarios-page"] h1')).toContainText('Horarios', { timeout: 10000 });
  });

  test('displays sex category tabs', async ({ page }) => {
    await expect(page.locator('text=Mujeres')).toBeVisible();
    await expect(page.locator('text=Hombres')).toBeVisible();
  });

  test('displays content tabs', async ({ page }) => {
    await expect(page.locator('text=Gestionar horarios')).toBeVisible();
    await expect(page.locator('text=Vista previa')).toBeVisible();
  });

  test('can switch between sex tabs', async ({ page }) => {
    await page.click('button:has-text("Hombres")');
    await page.waitForTimeout(300);
    await expect(page.locator('button:has-text("Hombres")')).toBeVisible();
  });

  test('can switch between content tabs', async ({ page }) => {
    await page.click('text=Vista previa');
    await expect(page.locator('[data-ui="preview-tab"]')).toBeVisible();

    await page.click('text=Gestionar horarios');
    await expect(page.locator('[data-ui="manage-tab"]')).toBeVisible();
  });

  test('no console errors', async ({ page }) => {
    const monitor = monitorConsole(page);
    await page.reload();
    await page.waitForLoadState('networkidle');
    monitor.assertNoErrors();
  });
});
