import { test, expect } from '@playwright/test';
import { logout, loginViaApi } from '../shared/auth.helpers';

test.describe('Protected Routes', () => {
  const protectedRoutes = [
    '/admin/dashboard',
    '/admin/participants',
    '/admin/draw',
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
      await expect(page).toHaveURL(/\/admin\/login/, { timeout: 10000 });
    }
  });

  test('allows access when authenticated', async ({ page }) => {
    await loginViaApi(page);
    await page.waitForTimeout(500);

    await page.goto('/admin/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(page.locator('h1')).toContainText('Admin Dashboard', { timeout: 10000 });
  });

  test('authenticated user can access backoffice home', async ({ page }) => {
    await loginViaApi(page);
    await page.waitForTimeout(500);

    await page.goto('/backoffice');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/backoffice/);
    await expect(page.locator('h1')).toContainText('Panel de Administración', { timeout: 10000 });
  });
});
