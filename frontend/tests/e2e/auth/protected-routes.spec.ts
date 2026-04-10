import { test, expect } from '@playwright/test';
import { logout, loginViaApi } from '../shared/auth.helpers';

test.describe('Protected Routes', () => {
  const protectedRoutes = [
    '/backoffice',
    '/backoffice/inscripciones',
    '/backoffice/horarios',
    '/backoffice/sorteo',
    '/backoffice/configuracion',
  ];

  test('redirects to login when unauthenticated', async ({ page }) => {
    await logout(page);

    for (const route of protectedRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/backoffice\/login/, { timeout: 10000 });
    }
  });

  test('authenticated user can access backoffice home', async ({ page }) => {
    await loginViaApi(page);

    await page.goto('/backoffice');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('h1').filter({ hasText: 'Panel de Administracion' })).toBeVisible({ timeout: 15000 });
  });
});
