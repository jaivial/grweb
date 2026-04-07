import { test, expect } from '@playwright/test';
import { loginViaApi } from '../shared/auth.helpers';
import { monitorConsole } from '../shared/console-monitor';
import {
  seedStripeConfig,
  clearStripeConfig,
  getStripeConfig,
  SEED_STRIPE_CONFIG,
} from '../shared/stripe-config.helpers';

test.describe('Backoffice Configuracion - Stripe Tab', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto('/backoffice/configuracion');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test.afterEach(async ({ page }) => {
    await clearStripeConfig(page);
  });

  test('displays Stripe tab alongside Email tab', async ({ page }) => {
    await expect(page.locator('text=Stripe')).toBeVisible();
    await expect(page.locator('text=Configuración de Email')).toBeVisible();
  });

  test('can switch to Stripe tab', async ({ page }) => {
    await page.locator('text=Stripe').click();
    await page.waitForTimeout(300);

    await expect(page.locator('[data-ui="stripe-settings-form"]')).toBeVisible();
    await expect(page.locator('[data-ui="stripe-keys-section"]')).toBeVisible();
  });

  test('shows all Stripe form fields', async ({ page }) => {
    await page.locator('text=Stripe').click();
    await page.waitForTimeout(300);

    await expect(page.locator('text=Clave Secreta (Secret Key)')).toBeVisible();
    await expect(page.locator('text=Clave Publicable (Publishable Key)')).toBeVisible();
    await expect(page.locator('text=Secreto de Webhook (Webhook Secret)')).toBeVisible();
  });

  test('shows validation errors on empty submit', async ({ page }) => {
    await page.locator('text=Stripe').click();
    await page.waitForTimeout(300);

    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(300);

    await expect(page.locator('text=La clave secreta es obligatoria')).toBeVisible();
    await expect(page.locator('text=La clave publicable es obligatoria')).toBeVisible();
    await expect(page.locator('text=El secreto del webhook es obligatorio')).toBeVisible();
  });

  test('can save Stripe config successfully', async ({ page }) => {
    await page.locator('text=Stripe').click();
    await page.waitForTimeout(300);

    // Fill form
    await page.locator('[data-ui="stripe-secret-key-input"]').fill('sk_test_1234567890abcdef1234567890');
    await page.locator('[data-ui="stripe-publishable-key-input"]').fill('pk_test_1234567890abcdef1234567890');
    await page.locator('[data-ui="stripe-webhook-secret-input"]').fill('whsec_test_1234567890abcdef1234567890');

    // Submit
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(2000);

    // Success message
    await expect(page.locator('[data-ui="stripe-success-message"]')).toBeVisible();

    // Verify data was saved via API
    const config = await getStripeConfig(page);
    expect(config?.publishableKey).toBe('pk_test_1234567890abcdef1234567890');
    // Secret key and webhook secret should be masked
    expect(config?.secretKey).toContain('****');
    expect(config?.webhookSecret).toContain('****');
  });

  test('loads existing Stripe config on page visit', async ({ page }) => {
    // Seed config first
    await seedStripeConfig(page, SEED_STRIPE_CONFIG);
    await page.waitForTimeout(300);

    // Navigate to page and switch to Stripe tab
    await page.goto('/backoffice/configuracion');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await page.locator('text=Stripe').click();
    await page.waitForTimeout(500);

    // Publishable key should be visible (it's not masked)
    await expect(page.locator('[data-ui="stripe-publishable-key-input"]')).toHaveValue(
      SEED_STRIPE_CONFIG.publishableKey ?? ''
    );
    // Secret fields show masked values
    await expect(page.locator('[data-ui="stripe-secret-key-input"]')).not.toHaveValue('');
    await expect(page.locator('[data-ui="stripe-webhook-secret-input"]')).not.toHaveValue('');
  });

  test('can switch between Email and Stripe tabs', async ({ page }) => {
    // Start on Email tab
    await expect(page.locator('[data-ui="email-settings-form"]')).toBeVisible();

    // Switch to Stripe
    await page.locator('text=Stripe').click();
    await page.waitForTimeout(300);
    await expect(page.locator('[data-ui="stripe-settings-form"]')).toBeVisible();

    // Switch back to Email
    await page.locator('text=Configuración de Email').click();
    await page.waitForTimeout(300);
    await expect(page.locator('[data-ui="email-settings-form"]')).toBeVisible();
  });

  test('shows info banner about credentials storage', async ({ page }) => {
    await page.locator('text=Stripe').click();
    await page.waitForTimeout(300);

    await expect(page.locator('[data-ui="stripe-info-banner"]')).toBeVisible();
    await expect(page.locator('[data-ui="stripe-info-banner"]')).toContainText('base de datos');
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
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.removeItem('gr_cup_token'));

    await page.goto('/backoffice/configuracion');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/backoffice\/login/);
  });
});
