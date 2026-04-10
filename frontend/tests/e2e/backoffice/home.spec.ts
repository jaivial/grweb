import { test, expect } from '@playwright/test';
import { loginViaApi } from '../shared/auth.helpers';
import { monitorConsole } from '../shared/console-monitor';

test.describe('Backoffice Home', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto('/backoffice');
    await page.waitForLoadState('domcontentloaded');
  });

  test('displays backoffice header', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Panel de Administracion' })).toBeVisible({ timeout: 15000 });
  });

  test('displays navigation cards', async ({ page }) => {
    await expect(page.locator('text=Inscripciones').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Sorteo').first()).toBeVisible();
    await expect(page.locator('text=Horarios').first()).toBeVisible();
    await expect(page.locator('text=Configuración General').first()).toBeVisible();
  });

  test('navigation links work', async ({ page }) => {
    await page.click('a[href="/backoffice/inscripciones"]');
    await expect(page).toHaveURL(/\/backoffice\/inscripciones/, { timeout: 10000 });

    await page.goto('/backoffice');
    await page.waitForLoadState('domcontentloaded');
    await page.click('a[href="/backoffice/horarios"]');
    await expect(page).toHaveURL(/\/backoffice\/horarios/, { timeout: 10000 });

    await page.goto('/backoffice');
    await page.waitForLoadState('domcontentloaded');
    await page.click('a[href="/backoffice/sorteo"]');
    await expect(page).toHaveURL(/\/backoffice\/sorteo/, { timeout: 10000 });

    await page.goto('/backoffice');
    await page.waitForLoadState('domcontentloaded');
    await page.click('a[href="/backoffice/configuracion"]');
    await expect(page).toHaveURL(/\/backoffice\/configuracion/, { timeout: 10000 });
  });

  test('no console errors', async ({ page }) => {
    const monitor = monitorConsole(page);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    monitor.assertNoErrors();
  });
});
