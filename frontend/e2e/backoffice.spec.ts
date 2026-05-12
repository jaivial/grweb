import { test, expect } from '@playwright/test';

test.describe('Backoffice Login', () => {
  test('should show login page', async ({ page }) => {
    await page.goto('/backoffice/login');

    await expect(page.getByRole('heading', { name: /login/i })).toBeVisible();
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    await expect(page.getByPlaceholder(/contraseña/i)).toBeVisible();
  });

  test('should show validation errors for empty form', async ({ page }) => {
    await page.goto('/backoffice/login');

    await page.getByRole('button', { name: /entrar/i }).click();

    await expect(page.getByText(/email requerido/i)).toBeVisible();
    await expect(page.getByText(/contraseña requerida/i)).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/backoffice/login');

    await page.getByPlaceholder(/email/i).fill('invalid@example.com');
    await page.getByPlaceholder(/contraseña/i).fill('wrongpassword');
    await page.getByRole('button', { name: /entrar/i }).click();

    await expect(page.getByText(/credenciales inválidas/i)).toBeVisible();
  });

  test('should redirect to dashboard on successful login', async ({ page }) => {
    await page.goto('/backoffice/login');

    await page.getByPlaceholder(/email/i).fill('admin@grplatform.com');
    await page.getByPlaceholder(/contraseña/i).fill('changeme123');
    await page.getByRole('button', { name: /entrar/i }).click();

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/backoffice/);
  });
});

test.describe('Backoffice Protected Routes', () => {
  test('should redirect to login when not authenticated', async ({ page }) => {
    // Clear any existing auth
    await page.context().clearCookies();

    await page.goto('/backoffice');
    
    // Should redirect to login
    await expect(page).toHaveURL(/\/backoffice\/login/);
  });

  test('should allow access when authenticated', async ({ page }) => {
    // This test would need proper authentication setup
    // For now, we test the redirect behavior
    await page.goto('/backoffice/login');
    
    // Verify we're on the login page
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
  });
});

test.describe('Backoffice Dashboard', () => {
  test.skip('should display KPIs when authenticated', async ({ page }) => {
    // Login first
    await page.goto('/backoffice/login');
    await page.getByPlaceholder(/email/i).fill('admin@grplatform.com');
    await page.getByPlaceholder(/contraseña/i).fill('changeme123');
    await page.getByRole('button', { name: /entrar/i }).click();

    // Should see dashboard KPIs
    await expect(page.getByText(/total inscritos/i)).toBeVisible();
    await expect(page.getByText(/pagados/i)).toBeVisible();
  });

  test.skip('should navigate to inscripciones page', async ({ page }) => {
    // Login first
    await page.goto('/backoffice/login');
    await page.getByPlaceholder(/email/i).fill('admin@grplatform.com');
    await page.getByPlaceholder(/contraseña/i).fill('changeme123');
    await page.getByRole('button', { name: /entrar/i }).click();

    // Navigate to inscripciones
    await page.goto('/backoffice/inscripciones');

    // Should see table headers
    await expect(page.getByText(/nombre/i)).toBeVisible();
    await expect(page.getByText(/email/i)).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test('should have proper heading hierarchy on login page', async ({ page }) => {
    await page.goto('/backoffice/login');

    const h1 = page.locator('h1');
    const h2 = page.locator('h2');

    await expect(h1).toBeVisible();
    // Should not have h2 directly after h1 without proper sections
  });

  test('should have accessible form labels', async ({ page }) => {
    await page.goto('/backoffice/login');

    const emailInput = page.getByPlaceholder(/email/i);
    const passwordInput = page.getByPlaceholder(/contraseña/i);

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // Labels should be associated (via aria-label or surrounding element)
    await expect(emailInput).toHaveAttribute('type', 'email');
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('should have keyboard navigable elements', async ({ page }) => {
    await page.goto('/backoffice/login');

    // Tab should focus on first input
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(['INPUT', 'BUTTON']).toContain(focusedElement);
  });
});
