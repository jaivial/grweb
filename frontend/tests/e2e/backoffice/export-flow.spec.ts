import { test, expect } from '@playwright/test';
import { monitorConsole } from '../shared/console-monitor';

const USER_EMAIL = 'jaimebillanueba99@gmail.com';
const USER_PASS = 'Jva-Mvc-5171';

async function loginWithCredentials(page: import('@playwright/test').Page) {
  await page.goto('/backoffice/login');
  await page.waitForLoadState('domcontentloaded');
  await page.fill('[data-testid="login-username-input"]', USER_EMAIL);
  await page.fill('[data-testid="login-password-input"]', USER_PASS);
  await page.click('[data-testid="login-submit-btn"]');
  await page.waitForURL(/\/backoffice(?!\/login)/, { timeout: 15000 });
}

test.describe('Export flow - Inscripciones (GR Cup)', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithCredentials(page);
    await page.goto('/backoffice/inscripciones');
    await page.waitForLoadState('domcontentloaded');
  });

  test('opens export modal with all sections', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });

    await page.locator('[data-ui="export-btn"]').click();
    await expect(page.locator('[data-ui="export-modal-content"]')).toBeVisible({ timeout: 5000 });

    // Format selector
    await expect(page.locator('[data-ui="export-format-pdf"]')).toBeVisible();
    await expect(page.locator('[data-ui="export-format-csv"]')).toBeVisible();

    // Filters
    await expect(page.locator('[data-ui="export-modal-filter-search"]')).toBeVisible();
    await expect(page.locator('[data-ui="export-modal-filter-sex"]')).toBeVisible();
    await expect(page.locator('[data-ui="export-modal-filter-category"]')).toBeVisible();
    await expect(page.locator('[data-ui="export-modal-filter-status"]')).toBeVisible();
    await expect(page.locator('[data-ui="export-modal-filter-club"]')).toBeVisible();

    // Order-by
    await expect(page.locator('[data-ui="order-by-dropdown-trigger"]')).toBeVisible();

    // Action buttons
    await expect(page.locator('[data-ui="export-modal-cancel"]')).toBeVisible();
    await expect(page.locator('[data-ui="export-modal-export-btn"]')).toBeVisible();
  });

  test('can switch to CSV format', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });
    await page.locator('[data-ui="export-btn"]').click();
    await expect(page.locator('[data-ui="export-modal-content"]')).toBeVisible();

    await page.locator('[data-ui="export-format-csv"]').click();
    await expect(page.locator('[data-ui="export-modal-export-btn"]')).toContainText('CSV');
  });

  test('can change order-by field via dropdown', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });
    await page.locator('[data-ui="export-btn"]').click();
    await expect(page.locator('[data-ui="export-modal-content"]')).toBeVisible();

    await page.locator('[data-ui="order-by-dropdown-trigger"]').click();
    await expect(page.locator('[data-ui="order-by-dropdown-menu"]')).toBeVisible();
    await page.locator('[data-ui="order-by-option-email"]').click();
    await expect(page.locator('[data-ui="order-by-dropdown-trigger"]')).toContainText('Email');
  });

  test('can toggle order direction', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });
    await page.locator('[data-ui="export-btn"]').click();
    await expect(page.locator('[data-ui="export-modal-content"]')).toBeVisible();

    const dirBtn = page.locator('[data-ui="order-by-direction-btn"]');
    await expect(dirBtn).toBeVisible();
    await dirBtn.click();
    await expect(dirBtn).toBeVisible();
  });

  test('can close modal via cancel', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });
    await page.locator('[data-ui="export-btn"]').click();
    await expect(page.locator('[data-ui="export-modal-content"]')).toBeVisible();

    await page.locator('[data-ui="export-modal-cancel"]').click();
    await expect(page.locator('[data-ui="export-modal-content"]')).not.toBeVisible();
  });

  test('export triggers API call (PDF)', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });

    const apiPromise = page.waitForResponse(
      resp => resp.url().includes('/api/admin/athletes/export') && resp.status() === 200,
      { timeout: 20000 }
    );

    await page.locator('[data-ui="export-btn"]').click();
    await expect(page.locator('[data-ui="export-modal-content"]')).toBeVisible();
    await page.locator('[data-ui="export-modal-export-btn"]').click();

    const response = await apiPromise;
    expect(response.ok()).toBeTruthy();
  });

  test('export triggers API call (CSV)', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });

    const apiPromise = page.waitForResponse(
      resp => resp.url().includes('/api/admin/athletes/export') && resp.status() === 200,
      { timeout: 20000 }
    );

    await page.locator('[data-ui="export-btn"]').click();
    await expect(page.locator('[data-ui="export-modal-content"]')).toBeVisible();
    await page.locator('[data-ui="export-format-csv"]').click();
    await page.locator('[data-ui="export-modal-export-btn"]').click();

    const response = await apiPromise;
    expect(response.ok()).toBeTruthy();
  });

  test('no console errors during export flow', async ({ page }) => {
    const monitor = monitorConsole(page);
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });
    await page.locator('[data-ui="export-btn"]').click();
    await expect(page.locator('[data-ui="export-modal-content"]')).toBeVisible();
    await page.locator('[data-ui="export-modal-cancel"]').click();
    await expect(page.locator('[data-ui="export-modal-content"]')).not.toBeVisible();
    monitor.assertNoErrors();
  });
});
