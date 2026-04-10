import { test, expect } from '@playwright/test';
import { loginViaApi, logout } from '../shared/auth.helpers';
import { monitorConsole } from '../shared/console-monitor';

test.describe('Backoffice Configuracion - General Settings', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure authenticated before navigating
    const cookies = await page.context().cookies();
    const hasAuthCookie = cookies.some(c => c.name === 'gr_cup_token');
    if (!hasAuthCookie) {
      await loginViaApi(page);
    }
    await page.goto('/backoffice/configuracion');
    await page.waitForLoadState('domcontentloaded');
  });

  test('displays page header', async ({ page }) => {
    await expect(
      page.locator('h1').filter({ hasText: 'Configuración General' })
    ).toBeVisible({ timeout: 10000 });
  });

  test('displays email settings tab', async ({ page }) => {
    await expect(page.locator('text=Configuración de Email')).toBeVisible();
  });

  test('displays Stripe tab', async ({ page }) => {
    await expect(page.locator('text=Stripe')).toBeVisible();
  });

  test('Gmail fields shown by default', async ({ page }) => {
    // Default provider is Gmail — wait for email tab content
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await expect(page.getByText('Proveedor de email')).toBeVisible({ timeout: 20000 });
  });

  test('no console errors during interaction', async ({ page }) => {
    const monitor = monitorConsole(page);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    monitor.assertNoErrors();
  });
});

test.describe('Backoffice Configuracion - Protected Route', () => {
  test('redirects unauthenticated users to login', async ({ page }) => {
    await logout(page);

    await page.goto('/backoffice/configuracion');
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveURL(/\/backoffice\/login/);
  });
});
