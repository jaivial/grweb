import { test, expect } from '@playwright/test';
import { loginViaApi } from '../shared/auth.helpers';
import { monitorConsole } from '../shared/console-monitor';

test.describe('Backoffice Inscripciones', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto('/backoffice/inscripciones');
    await page.waitForLoadState('domcontentloaded');
  });

  test('displays page header', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Inscripciones' })).toBeVisible({ timeout: 15000 });
  });

  test('displays tabs', async ({ page }) => {
    await expect(page.locator('text=Todas las inscripciones')).toBeVisible();
    await expect(page.locator('text=Añadir inscripción')).toBeVisible();
  });

  test('displays KPI cards', async ({ page }) => {
    await expect(page.locator('text=Total').first()).toBeVisible();
    await expect(page.locator('text=Pagados')).toBeVisible();
    await expect(page.locator('text=Pendientes')).toBeVisible();
  });

  test('table or empty state visible', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 5000 });
  });

  test('can switch to add inscription tab', async ({ page }) => {
    await page.click('text=Añadir inscripción');
    await expect(page.locator('text=Nueva Inscripción')).toBeVisible();
  });

  test('no console errors', async ({ page }) => {
    const monitor = monitorConsole(page);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    monitor.assertNoErrors();
  });

  test.describe('Export functionality', () => {
    test('opens export modal with filters and order-by', async ({ page }) => {
      await expect(page.locator('table')).toBeVisible({ timeout: 10000 });

      const exportBtn = page.locator('[data-ui="export-btn"]');
      await expect(exportBtn).toBeVisible();
      await exportBtn.click();

      await expect(page.locator('[data-ui="export-modal-content"]')).toBeVisible();
      await expect(page.locator('[data-ui="export-format-pdf"]')).toBeVisible();
      await expect(page.locator('[data-ui="export-format-csv"]')).toBeVisible();
      await expect(page.locator('[data-ui="export-modal-filters"]')).toBeVisible();
      await expect(page.locator('[data-ui="export-modal-filter-search"]')).toBeVisible();
      await expect(page.locator('[data-ui="export-modal-filter-sex"]')).toBeVisible();
      await expect(page.locator('[data-ui="export-modal-filter-category"]')).toBeVisible();
      await expect(page.locator('[data-ui="export-modal-filter-status"]')).toBeVisible();
      await expect(page.locator('[data-ui="export-modal-filter-club"]')).toBeVisible();
      await expect(page.locator('[data-ui="order-by-dropdown-trigger"]')).toBeVisible();
      await expect(page.locator('[data-ui="export-modal-cancel"]')).toBeVisible();
      await expect(page.locator('[data-ui="export-modal-export-btn"]')).toBeVisible();
    });

    test('can switch format between PDF and CSV', async ({ page }) => {
      await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
      await page.locator('[data-ui="export-btn"]').click();
      await expect(page.locator('[data-ui="export-modal-content"]')).toBeVisible();

      await page.locator('[data-ui="export-format-csv"]').click();
      await expect(page.locator('[data-ui="export-modal-export-btn"]')).toContainText('CSV');
    });

    test('can apply filters in modal', async ({ page }) => {
      await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
      await page.locator('[data-ui="export-btn"]').click();
      await expect(page.locator('[data-ui="export-modal-content"]')).toBeVisible();

      const searchInput = page.locator('[data-ui="export-modal-search-input"]');
      await searchInput.fill('test');

      await page.locator('[data-ui="export-modal-clear-filters"]').click();
      await expect(searchInput).toHaveValue('');
    });

    test('can change order by dropdown', async ({ page }) => {
      await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
      await page.locator('[data-ui="export-btn"]').click();
      await expect(page.locator('[data-ui="export-modal-content"]')).toBeVisible();

      await page.locator('[data-ui="order-by-dropdown-trigger"]').click();
      await expect(page.locator('[data-ui="order-by-dropdown-menu"]')).toBeVisible();

      await page.locator('[data-ui="order-by-option-email"]').click();
      await expect(page.locator('[data-ui="order-by-dropdown-trigger"]')).toContainText('Email');
    });

    test('can toggle order direction', async ({ page }) => {
      await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
      await page.locator('[data-ui="export-btn"]').click();
      await expect(page.locator('[data-ui="export-modal-content"]')).toBeVisible();

      const dirBtn = page.locator('[data-ui="order-by-direction-btn"]');
      await expect(dirBtn).toBeVisible();
      await dirBtn.click();
      await expect(dirBtn).toBeVisible();
    });

    test('can close modal with cancel button', async ({ page }) => {
      await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
      await page.locator('[data-ui="export-btn"]').click();
      await expect(page.locator('[data-ui="export-modal-content"]')).toBeVisible();

      await page.locator('[data-ui="export-modal-cancel"]').click();
      await expect(page.locator('[data-ui="export-modal-content"]')).not.toBeVisible();
    });

    test('export triggers API call for PDF', async ({ page }) => {
      await expect(page.locator('table')).toBeVisible({ timeout: 10000 });

      const apiPromise = page.waitForResponse(
        resp => resp.url().includes('/api/admin/athletes/export') && resp.status() === 200,
        { timeout: 15000 }
      );

      await page.locator('[data-ui="export-btn"]').click();
      await expect(page.locator('[data-ui="export-modal-content"]')).toBeVisible();
      await page.locator('[data-ui="export-modal-export-btn"]').click();

      const response = await apiPromise;
      expect(response.ok()).toBeTruthy();
    });

    test('export triggers API call for CSV', async ({ page }) => {
      await expect(page.locator('table')).toBeVisible({ timeout: 10000 });

      const apiPromise = page.waitForResponse(
        resp => resp.url().includes('/api/admin/athletes/export') && resp.status() === 200,
        { timeout: 15000 }
      );

      await page.locator('[data-ui="export-btn"]').click();
      await expect(page.locator('[data-ui="export-modal-content"]')).toBeVisible();
      await page.locator('[data-ui="export-format-csv"]').click();
      await page.locator('[data-ui="export-modal-export-btn"]').click();

      const response = await apiPromise;
      expect(response.ok()).toBeTruthy();
    });

    test('no console errors when opening modal', async ({ page }) => {
      const monitor = monitorConsole(page);
      await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
      await page.locator('[data-ui="export-btn"]').click();
      await expect(page.locator('[data-ui="export-modal-content"]')).toBeVisible();
      await page.locator('[data-ui="export-modal-cancel"]').click();
      await expect(page.locator('[data-ui="export-modal-content"]')).not.toBeVisible();
      monitor.assertNoErrors();
    });
  });
});
