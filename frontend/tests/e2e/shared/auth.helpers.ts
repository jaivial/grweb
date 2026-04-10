import { Page } from '@playwright/test';
import { TEST_CREDENTIALS } from './api.helpers';

/**
 * Performs login via API using cookie auth.
 * The backend sets an HttpOnly cookie on successful login.
 * No localStorage needed — auth is cookie-based.
 */
export async function loginViaApi(page: Page): Promise<void> {
  // Navigate to the app first so we have a valid origin for the fetch
  await page.goto('/backoffice/login');
  await page.waitForLoadState('domcontentloaded');

  // Fill login form using the actual UI
  await page.getByRole('textbox', { name: 'Username' }).fill(TEST_CREDENTIALS.username);
  await page.getByRole('textbox', { name: 'Password' }).fill(TEST_CREDENTIALS.password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Wait for redirect to backoffice
  await page.waitForURL(/\/backoffice(?!\/login)/, { timeout: 10000 });
}

/**
 * Clears auth state by clearing cookies and navigating to login.
 */
export async function logout(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/backoffice/login');
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Navigates to login page and waits for it to load.
 */
export async function goToLogin(page: Page): Promise<void> {
  await page.goto('/backoffice/login');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(300);
}
