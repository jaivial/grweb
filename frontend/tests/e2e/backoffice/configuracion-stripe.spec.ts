import { test, expect } from '@playwright/test';
import { loginViaApi, logout } from '../shared/auth.helpers';
import { monitorConsole } from '../shared/console-monitor';

test.describe('Backoffice Configuracion - Stripe Tab', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto('/backoffice/configuracion');
    await page.waitForLoadState('domcontentloaded');
  });

  test('displays Stripe tab alongside Email tab', async ({ page }) => {
    await expect(page.locator('text=Stripe')).toBeVisible();
    await expect(page.locator('text=Configuración de Email')).toBeVisible();
  });

  test('can switch to Stripe tab', async ({ page }) => {
    await page.locator('text=Stripe').click();
    await page.waitForTimeout(300);

    await expect(page.locator('text=Claves de API de Stripe')).toBeVisible();
    await expect(page.locator('text=Clave Secreta')).toBeVisible();
  });

  test('shows all Stripe form fields', async ({ page }) => {
    await page.locator('text=Stripe').click();
    await page.waitForTimeout(300);

    await expect(page.locator('text=Clave Secreta (Secret Key)')).toBeVisible();
    await expect(page.locator('text=Clave Publicable (Publishable Key)')).toBeVisible();
    await expect(page.locator('text=Secreto de Webhook (Webhook Secret)')).toBeVisible();
  });

  test('shows info banner about credentials storage', async ({ page }) => {
    await page.locator('text=Stripe').click();
    await page.waitForTimeout(300);

    await expect(page.locator('text=Las credenciales se almacenan')).toBeVisible();
    await expect(page.locator('text=base de datos')).toBeVisible();
  });

  test('can switch between Email and Stripe tabs', async ({ page }) => {
    // Start on Email tab
    await expect(page.locator('text=Configuración Gmail')).toBeVisible();

    // Switch to Stripe
    await page.locator('text=Stripe').click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=Claves de API de Stripe')).toBeVisible();

    // Switch back to Email
    await page.locator('text=Configuración de Email').click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=Configuración Gmail')).toBeVisible();
  });

  test('no console errors during Stripe tab interaction', async ({ page }) => {
    const consoleMonitor = monitorConsole(page);
    await page.locator('text=Stripe').click();
    await page.waitForTimeout(500);
    consoleMonitor.assertNoErrors();
  });
});

test.describe('Backoffice Configuracion Stripe - Protected Route', () => {
  test('redirects unauthenticated users to login when visiting Stripe config', async ({ page }) => {
    await logout(page);

    await page.goto('/backoffice/configuracion');
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveURL(/\/backoffice\/login/);
  });
});
