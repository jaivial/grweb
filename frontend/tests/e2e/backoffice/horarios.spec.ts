import { test, expect } from '@playwright/test';
import { loginViaApi } from '../shared/auth.helpers';
import { monitorConsole } from '../shared/console-monitor';

test.describe('Backoffice Horarios', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto('/backoffice/horarios');
    await page.waitForLoadState('domcontentloaded');
  });

  test('displays page header', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Horarios' })).toBeVisible({ timeout: 15000 });
  });

  test('displays sex category tabs', async ({ page }) => {
    await expect(page.locator('text=Mujeres')).toBeVisible();
    await expect(page.locator('text=Hombres')).toBeVisible();
  });

  test('displays content tabs', async ({ page }) => {
    await expect(page.locator('text=Gestionar horarios')).toBeVisible();
    await expect(page.locator('text=Vista previa')).toBeVisible();
  });

  test('can switch between content tabs', async ({ page }) => {
    await page.click('text=Vista previa');
    await expect(page.locator('[data-ui="preview-container"]')).toBeVisible();

    await page.click('text=Gestionar horarios');
    await expect(page.locator('[data-ui="manage-tab"]')).toBeVisible();
  });

  test('no console errors', async ({ page }) => {
    const monitor = monitorConsole(page);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    monitor.assertNoErrors();
  });
});
