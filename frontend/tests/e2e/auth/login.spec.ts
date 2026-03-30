import { test, expect } from '@playwright/test';
import { goToLogin, logout } from '../shared/auth.helpers';
import { TEST_CREDENTIALS } from '../shared/api.helpers';

test.describe('Admin Login', () => {
  test.beforeEach(async ({ page }) => {
    await logout(page);
    await goToLogin(page);
    // Wait for the page to be fully loaded
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('shows login form with correct elements', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Admin Login', { timeout: 10000 });
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('successful login with valid credentials redirects to dashboard', async ({ page }) => {
    await page.fill('input[name="username"]', TEST_CREDENTIALS.username);
    await page.fill('input[name="password"]', TEST_CREDENTIALS.password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 15000 });
    await expect(page.locator('h1')).toContainText('Admin Dashboard', { timeout: 10000 });
  });

  test('failed login with invalid credentials shows error', async ({ page }) => {
    await page.fill('input[name="username"]', 'wrong@example.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Login failed').first()).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('empty credentials shows validation error', async ({ page }) => {
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Username is required')).toBeVisible({ timeout: 5000 });
  });
});
