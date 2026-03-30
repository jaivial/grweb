import { Page, BrowserContext } from '@playwright/test';
import { TEST_CREDENTIALS } from './api.helpers';

const TOKEN_KEY = 'gr_cup_token';
let cachedToken: string | null = null;

/**
 * Performs login via API using cookie-based auth.
 * Cookie is set automatically by the browser when backend responds with Set-Cookie.
 */
export async function loginViaApi(page: Page): Promise<string> {
  if (!cachedToken) {
    // First navigate to the app so we have a valid origin
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Use page.evaluate to make the request from within browser context
    // This ensures cookies are properly handled by the browser
    const result = await page.evaluate(async (creds) => {
      const baseUrl = window.location.origin;
      const response = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(creds),
      });

      if (!response.ok) {
        throw new Error(`Login failed: ${response.status}`);
      }

      return { success: true };
    }, TEST_CREDENTIALS);

    if (!result.success) {
      throw new Error('Login failed');
    }

    cachedToken = 'cookie-authenticated';
  }

  // Navigate to admin/dashboard - cookie auth should work
  await page.goto('/admin/dashboard');
  await page.waitForLoadState('networkidle');

  return cachedToken;
}

/**
 * Clears auth state by clearing cookies
 */
export async function logout(page: Page): Promise<void> {
  cachedToken = null;

  // Clear cookies in browser context
  await page.context().clearCookies();

  // Navigate to login page
  await page.goto('/admin/login');
  await page.waitForLoadState('networkidle');
}

/**
 * Checks if user is authenticated by verifying cookie exists
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  const cookies = await page.context().cookies();
  return cookies.some(c => c.name === 'gr_cup_token');
}

/**
 * Navigates to login page and waits for it to load
 */
export async function goToLogin(page: Page): Promise<void> {
  await page.goto('/admin/login');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
}
