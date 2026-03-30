import { test, expect } from '@playwright/test';
import { loginViaApi } from '../shared/auth.helpers';
import { monitorConsole } from '../shared/console-monitor';

test.describe('Backoffice Inscripciones', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto('/backoffice/inscripciones');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('displays page header', async ({ page }) => {
    await expect(page.locator('[data-ui="inscripciones-page"] h1')).toContainText('Inscripciones', { timeout: 10000 });
  });

  test('displays tabs', async ({ page }) => {
    await expect(page.locator('text=Todas las inscripciones')).toBeVisible();
    await expect(page.locator('text=Añadir inscripción')).toBeVisible();
  });

  test('displays KPI cards', async ({ page }) => {
    await expect(page.locator('[data-ui="kpi-section"]').locator('text=Total').first()).toBeVisible();
    await expect(page.locator('[data-ui="kpi-section"]').locator('text=Pagados')).toBeVisible();
    await expect(page.locator('[data-ui="kpi-section"]').locator('text=Pendientes')).toBeVisible();
  });

  test('table or empty state visible', async ({ page }) => {
    await expect(page.locator('[data-ui="table-container"]')).toBeVisible({ timeout: 5000 });
  });

  test('can switch to add inscription tab', async ({ page }) => {
    await page.click('text=Añadir inscripción');
    await expect(page.locator('text=Nueva Inscripción')).toBeVisible();
  });

  test('no console errors', async ({ page }) => {
    const monitor = monitorConsole(page);
    await page.reload();
    await page.waitForLoadState('networkidle');
    monitor.assertNoErrors();
  });
});
