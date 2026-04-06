import { test, expect } from '@playwright/test';
import { loginViaApi } from '../shared/auth.helpers';
import { monitorConsole } from '../shared/console-monitor';

test.describe('Backoffice Home', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto('/backoffice');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('displays backoffice header', async ({ page }) => {
    await expect(page.locator('[data-ui="backoffice-home"] h1')).toContainText('Panel de Administración', { timeout: 10000 });
  });

  test('displays navigation cards', async ({ page }) => {
    await expect(page.locator('text=Inscripciones')).toBeVisible();
    await expect(page.locator('text=Sorteo')).toBeVisible();
    await expect(page.locator('text=Horarios')).toBeVisible();
    await expect(page.locator('text=Configuración General')).toBeVisible();
  });

  test('navigation links work', async ({ page }) => {
    await page.click('a[href="/backoffice/inscripciones"]');
    await expect(page).toHaveURL(/\/backoffice\/inscripciones/, { timeout: 10000 });

    await page.goto('/backoffice');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await page.click('a[href="/backoffice/horarios"]');
    await expect(page).toHaveURL(/\/backoffice\/horarios/, { timeout: 10000 });

    await page.goto('/backoffice');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await page.click('a[href="/backoffice/sorteo"]');
    await expect(page).toHaveURL(/\/backoffice\/sorteo/, { timeout: 10000 });

    await page.goto('/backoffice');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await page.click('a[href="/backoffice/configuracion"]');
    await expect(page).toHaveURL(/\/backoffice\/configuracion/, { timeout: 10000 });
  });

  test('no console errors', async ({ page }) => {
    const monitor = monitorConsole(page);
    await page.reload();
    await page.waitForLoadState('networkidle');
    monitor.assertNoErrors();
  });
});
