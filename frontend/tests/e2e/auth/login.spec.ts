import { test, expect } from '@playwright/test';
import { goToLogin, logout } from '../shared/auth.helpers';
import { TEST_CREDENTIALS } from '../shared/api.helpers';

test.describe('Admin Login', () => {
  test.beforeEach(async ({ page }) => {
    await logout(page);
    await goToLogin(page);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
  });

  test('shows login form with correct elements', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Admin Login', { timeout: 10000 });
    await expect(page.getByRole('textbox', { name: 'Username' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('successful login with valid credentials redirects to backoffice', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Username' }).fill(TEST_CREDENTIALS.username);
    await page.getByRole('textbox', { name: 'Password' }).fill(TEST_CREDENTIALS.password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL(/\/backoffice(?!\/login)/, { timeout: 15000 });
  });

  test('failed login stays on login page', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Username' }).fill('wrong@example.com');
    await page.getByRole('textbox', { name: 'Password' }).fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL(/\/backoffice\/login/, { timeout: 10000 });
  });

  test('empty credentials shows validation error', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.locator('text=Username is required')).toBeVisible({ timeout: 5000 });
  });
});
