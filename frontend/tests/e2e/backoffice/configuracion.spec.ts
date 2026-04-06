import { test, expect } from '@playwright/test';
import { loginViaApi } from '../shared/auth.helpers';
import { monitorConsole } from '../shared/console-monitor';
import {
  seedEmailConfig,
  clearEmailConfig,
  getEmailConfig,
  SEED_EMAIL_CONFIG_SMTP,
  SEED_EMAIL_CONFIG_GMAIL,
} from '../shared/email-config.helpers';

test.describe('Backoffice Configuracion - General Settings', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto('/backoffice/configuracion');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test.afterEach(async ({ page }) => {
    // Clean up seeded data
    await clearEmailConfig(page);
  });

  test('displays page header with settings icon', async ({ page }) => {
    await expect(
      page.locator('[data-ui="configuracion-page"] h1')
    ).toContainText('Configuración General', { timeout: 10000 });
    // Settings icon should be visible in the header
    await expect(page.locator('[data-ui="configuracion-page"] svg').first()).toBeVisible();
  });

  test('displays email settings tab', async ({ page }) => {
    await expect(
      page.locator('[data-ui="configuracion-page"]')
    ).toContainText('Configuración de Email');
  });

  test('displays provider selector', async ({ page }) => {
    await expect(page.locator('text=Proveedor de email')).toBeVisible();
    await expect(page.locator('text=SMTP')).toBeVisible();
    await expect(page.locator('text=Gmail')).toBeVisible();
  });

  test('SMTP fields shown by default', async ({ page }) => {
    // Default provider is SMTP
    await expect(page.locator('[data-ui="smtp-fields"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-ui="gmail-fields"]')).not.toBeVisible();
    await expect(page.locator('text=Usuario SMTP')).toBeVisible();
    await expect(page.locator('text=Contraseña SMTP')).toBeVisible();
    await expect(page.locator('text=Dirección de email')).toBeVisible();
    await expect(page.locator('text=Host SMTP')).toBeVisible();
    await expect(page.locator('text=Puerto')).toBeVisible();
  });

  test('can switch to Gmail provider and Gmail fields appear', async ({ page }) => {
    // Click the provider selector trigger
    await page.locator('[data-ui="selector-trigger"]').click();
    await page.waitForTimeout(300);

    // Select Gmail
    await page.locator('text=Gmail').click();
    await page.waitForTimeout(300);

    // Gmail fields should appear
    await expect(page.locator('[data-ui="gmail-fields"]')).toBeVisible();
    await expect(page.locator('[data-ui="smtp-fields"]')).not.toBeVisible();
    await expect(page.locator('text=Dirección de Gmail')).toBeVisible();
    await expect(page.locator('text=Contraseña de aplicación')).toBeVisible();
  });

  test('can switch back to SMTP provider', async ({ page }) => {
    // First switch to Gmail
    await page.locator('[data-ui="selector-trigger"]').click();
    await page.waitForTimeout(300);
    await page.locator('text=Gmail').click();
    await page.waitForTimeout(300);

    // Then switch back to SMTP
    await page.locator('[data-ui="selector-trigger"]').click();
    await page.waitForTimeout(300);
    await page.locator('text=SMTP').click();
    await page.waitForTimeout(300);

    // SMTP fields should appear again
    await expect(page.locator('[data-ui="smtp-fields"]')).toBeVisible();
    await expect(page.locator('[data-ui="gmail-fields"]')).not.toBeVisible();
  });

  test('SMTP validation shows errors on empty submit', async ({ page }) => {
    // Try to submit empty form
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(300);

    await expect(page.locator('text=El usuario SMTP es obligatorio')).toBeVisible();
    await expect(page.locator('text=La contraseña SMTP es obligatoria')).toBeVisible();
    await expect(page.locator('text=El email SMTP es obligatorio')).toBeVisible();
    await expect(page.locator('text=El host SMTP es obligatorio')).toBeVisible();
  });

  test('Gmail validation shows errors on empty submit', async ({ page }) => {
    // Switch to Gmail
    await page.locator('[data-ui="selector-trigger"]').click();
    await page.waitForTimeout(300);
    await page.locator('text=Gmail').click();
    await page.waitForTimeout(300);

    // Try to submit empty form
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(300);

    await expect(page.locator('text=La dirección de Gmail es obligatoria')).toBeVisible();
    await expect(page.locator('text=La contraseña de aplicación es obligatoria')).toBeVisible();
  });

  test('Gmail validation rejects non-gmail addresses', async ({ page }) => {
    // Switch to Gmail
    await page.locator('[data-ui="selector-trigger"]').click();
    await page.waitForTimeout(300);
    await page.locator('text=Gmail').click();
    await page.waitForTimeout(300);

    // Fill with non-gmail address
    await page.locator('[data-ui="gmail-address-input"]').fill('test@yahoo.com');
    await page.locator('[data-ui="gmail-password-input"]').fill('password123');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(300);

    await expect(
      page.locator('text=Debe ser una cuenta de Gmail válida')
    ).toBeVisible();
  });

  test('can save SMTP config successfully', async ({ page }) => {
    // Fill SMTP form
    await page.locator('[data-ui="smtp-username-input"]').fill('smtpuser@example.com');
    await page.locator('[data-ui="smtp-password-input"]').fill('smtp-password-123');
    await page.locator('[data-ui="smtp-email-input"]').fill('noreply@example.com');
    await page.locator('[data-ui="smtp-host-input"]').fill('smtp.gmail.com');

    // Submit
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(2000);

    // Success message should appear
    await expect(page.locator('[data-ui="success-message"]')).toBeVisible();

    // Verify data was saved
    const config = await getEmailConfig(page);
    expect(config?.mainProvider).toBe(0);
    expect(config?.smtpUsername).toBe('smtpuser@example.com');
    expect(config?.smtpEmailAddress).toBe('noreply@example.com');
    expect(config?.smtpHost).toBe('smtp.gmail.com');
    expect(config?.smtpPort).toBe(587);
  });

  test('can save Gmail config successfully', async ({ page }) => {
    // Switch to Gmail
    await page.locator('[data-ui="selector-trigger"]').click();
    await page.waitForTimeout(300);
    await page.locator('text=Gmail').click();
    await page.waitForTimeout(300);

    // Fill Gmail form
    await page.locator('[data-ui="gmail-address-input"]').fill('test@gmail.com');
    await page.locator('[data-ui="gmail-password-input"]').fill('xxxx xxxx xxxx xxxx');

    // Submit
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(2000);

    // Success message should appear
    await expect(page.locator('[data-ui="success-message"]')).toBeVisible();

    // Verify data was saved
    const config = await getEmailConfig(page);
    expect(config?.mainProvider).toBe(1);
    expect(config?.gmailAddress).toBe('test@gmail.com');
    expect(config?.gmailAppPassword).toBe('xxxx xxxx xxxx xxxx');
  });

  test('loads existing SMTP config on page visit', async ({ page }) => {
    // Seed config first
    await seedEmailConfig(page, SEED_EMAIL_CONFIG_SMTP);
    await page.waitForTimeout(300);

    // Navigate to page
    await page.goto('/backoffice/configuracion');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // SMTP fields should be populated
    await expect(page.locator('[data-ui="smtp-username-input"]')).toHaveValue(
      SEED_EMAIL_CONFIG_SMTP.smtpUsername ?? ''
    );
    await expect(page.locator('[data-ui="smtp-email-input"]')).toHaveValue(
      SEED_EMAIL_CONFIG_SMTP.smtpEmailAddress ?? ''
    );
    await expect(page.locator('[data-ui="smtp-host-input"]')).toHaveValue(
      SEED_EMAIL_CONFIG_SMTP.smtpHost ?? ''
    );
  });

  test('loads existing Gmail config on page visit', async ({ page }) => {
    // Seed Gmail config first
    await seedEmailConfig(page, SEED_EMAIL_CONFIG_GMAIL);
    await page.waitForTimeout(300);

    // Navigate to page
    await page.goto('/backoffice/configuracion');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Gmail selector should be active
    await expect(page.locator('[data-ui="selector-trigger"]')).toContainText('Gmail');

    // Gmail fields should be visible and populated
    await expect(page.locator('[data-ui="gmail-fields"]')).toBeVisible();
    await expect(page.locator('[data-ui="gmail-address-input"]')).toHaveValue(
      SEED_EMAIL_CONFIG_GMAIL.gmailAddress ?? ''
    );
  });

  test('no console errors during interaction', async ({ page }) => {
    const monitor = monitorConsole(page);
    await page.reload();
    await page.waitForLoadState('networkidle');
    monitor.assertNoErrors();
  });
});

test.describe('Backoffice Configuracion - Protected Route', () => {
  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.removeItem('gr_cup_token'));

    await page.goto('/backoffice/configuracion');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/backoffice\/login/);
  });
});
