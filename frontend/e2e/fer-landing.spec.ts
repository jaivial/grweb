import { test, expect } from '@playwright/test';

test.describe('FER Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/fer');
  });

  test('should load the page without errors', async ({ page }) => {
    // Check that the page loaded
    await expect(page).toHaveTitle(/FER/);

    // Check for hero section
    const heroTitle = page.locator('h1');
    await expect(heroTitle).toBeVisible();
  });

  test('should display hero section with CTA', async ({ page }) => {
    // Check for CTA button
    const ctaButton = page.getByRole('button', { name: /inscribirme/i });
    await expect(ctaButton).toBeVisible();

    // Check for event info
    await expect(page.getByText('25 JULIO 2026')).toBeVisible();
    await expect(page.getByText('ALMUSSAFES')).toBeVisible();
  });

  test('should scroll to form when clicking CTA', async ({ page }) => {
    const ctaButton = page.getByRole('button', { name: /inscribirme/i });
    await ctaButton.click();

    // Form should be visible after scroll
    const formSection = page.locator('form');
    await expect(formSection).toBeInViewport();
  });

  test('should show validation errors for empty form submission', async ({ page }) => {
    // Navigate to form
    const ctaButton = page.getByRole('button', { name: /inscribirme/i });
    await ctaButton.click();

    // Submit empty form
    const submitButton = page.getByRole('button', { name: /confirmar/i });
    await submitButton.click();

    // Check for validation errors
    await expect(page.getByText(/nombre demasiado corto/i)).toBeVisible();
    await expect(page.getByText(/email inválido/i)).toBeVisible();
  });

  test('should accept valid form data', async ({ page }) => {
    // Navigate to form
    const ctaButton = page.getByRole('button', { name: /inscribirme/i });
    await ctaButton.click();

    // Fill form
    await page.getByPlaceholder('Tu nombre').fill('Juan García');
    await page.getByPlaceholder('tu@email.com').fill('juan@example.com');
    await page.getByPlaceholder('usuario').fill('juanga');

    // Select experiencia
    await page.getByRole('button', { name: /principiante/i }).click();

    // Accept terms
    await page.locator('input[type="checkbox"]').check();

    // Form should be submittable
    const submitButton = page.getByRole('button', { name: /confirmar/i });
    await expect(submitButton).toBeEnabled();
  });

  test('should toggle entrenador switch', async ({ page }) => {
    // Navigate to form
    const ctaButton = page.getByRole('button', { name: /inscribirme/i });
    await ctaButton.click();

    // Toggle should be off by default
    const toggle = page.locator('.relative.w-14.h-8').first();
    await expect(toggle).toHaveClass(/bg-gray-600/);

    // Click toggle
    await toggle.click();

    // Toggle should be on
    await expect(toggle).toHaveClass(/bg-blue-500/);
  });

  test('should display all content sections', async ({ page }) => {
    // Check for sections
    await expect(page.getByText(/qué es el evento/i)).toBeVisible();
    await expect(page.getByText(/qué incluye/i)).toBeVisible();
    await expect(page.getByText(/quién puede participar/i)).toBeVisible();
  });

  test('should have working navigation links', async ({ page }) => {
    // Check Instagram link exists
    const instagramLink = page.locator('a[href*="instagram"]');
    await expect(instagramLink).toBeVisible();
  });

  test('should display responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Page should still be usable
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByRole('button', { name: /inscribirme/i })).toBeVisible();
  });
});

test.describe('FER Landing Performance', () => {
  test('should load within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/fer');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;

    // Page should load within 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('should not have console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/fer');
    await page.waitForLoadState('networkidle');

    // Filter out known acceptable errors (e.g., from external resources)
    const criticalErrors = errors.filter(
      e => !e.includes('favicon') && !e.includes('404')
    );

    expect(criticalErrors).toHaveLength(0);
  });
});
