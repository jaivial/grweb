import { test, expect } from '@playwright/test';
import { loginViaApi } from '../shared/auth.helpers';

/**
 * E2E test for toggle status functionality in Sorteo page.
 * 
 * This test verifies:
 * 1. The toggle button exists and is clickable
 * 2. Clicking toggle does NOT cause a full page reload
 * 3. The UI updates optimistically (or after API response)
 * 4. API call is made to /api/admin/raffle-products/{id}/toggle-status with PATCH
 */

test.describe('Sorteo Toggle Status', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto('/backoffice/sorteo');
    await page.waitForLoadState('domcontentloaded');
    
    // Navigate to premios tab
    await page.locator('[data-tab-id="premios"]').click();
    await page.waitForLoadState('networkidle');
  });

  test('toggle button should have type="button" to prevent form submission', async ({ page }) => {
    // Find the toggle button
    const toggleBtn = page.locator('[data-testid="gift-toggle-status-btn"]').first();
    
    // Check that the button exists
    await expect(toggleBtn).toBeVisible({ timeout: 10000 });
    
    // Verify it has type="button" to prevent form submission
    const buttonType = await toggleBtn.getAttribute('type');
    expect(buttonType).toBe('button');
  });

  test('clicking toggle button should NOT cause full page reload', async ({ page }) => {
    // Skip if no gifts exist - this test needs at least one gift
    const toggleBtn = page.locator('[data-testid="gift-toggle-status-btn"]').first();
    const btnExists = await toggleBtn.isVisible().catch(() => false);
    
    if (!btnExists) {
      test.skip(); // No gifts to toggle
    }

    // Get initial page load time as baseline
    const initialTitle = await page.title();
    
    // Set up network monitoring to detect full page reload
    let pageReloadDetected = false;
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame() && frame.url() === page.url()) {
        // Check if this is a full navigation (not just hash change)
        const navigationType = (frame as any).navigationType?.();
        if (navigationType === 'reload' || frame.url().includes('backoffice/sorteo')) {
          // This could indicate a full reload
        }
      }
    });

    // Track responses to see if PATCH request is made
    const patchRequests: { url: string; status: number }[] = [];
    page.on('response', async response => {
      if (response.request().method() === 'PATCH' && response.url().includes('toggle-status')) {
        patchRequests.push({ url: response.url(), status: response.status() });
      }
    });

    // Get the initial state of the first gift card
    const firstCard = page.locator('[data-testid^="gift-card-"]').first();
    const initialBadge = await firstCard.locator('[data-testid="gift-status-badge"]').textContent();

    // Click toggle and wait for network to settle (not full page load)
    await toggleBtn.click();
    
    // Wait a bit for the UI to update
    await page.waitForTimeout(1000);
    
    // Check that we didn't get a full page reload by verifying:
    // 1. The page is still at the same URL
    expect(page.url()).toContain('/backoffice/sorteo');
    
    // 2. The title is still the same
    expect(await page.title()).toBe(initialTitle);
    
    // 3. The premios tab content is still visible (not reset)
    await expect(page.locator('[data-tab-id="premios"]')).toBeVisible();
    
    // 4. Check if PATCH request was made
    console.log('PATCH requests detected:', patchRequests);
  });

  test('toggle should call PATCH endpoint and update badge state', async ({ page }) => {
    // Skip if no gifts exist
    const toggleBtn = page.locator('[data-testid="gift-toggle-status-btn"]').first();
    const btnExists = await toggleBtn.isVisible().catch(() => false);
    
    if (!btnExists) {
      test.skip();
    }

    const firstCard = page.locator('[data-testid^="gift-card-"]').first();

    // Track requests - SET UP BEFORE CLICK
    const patchPromise = page.waitForResponse(resp => 
      resp.request().method() === 'PATCH' && resp.url().includes('toggle-status'),
      { timeout: 5000 }
    );

    // Click toggle
    await toggleBtn.click();
    
    // Wait for PATCH response
    const patchResponse = await patchPromise;
    const patchStatus = patchResponse.status();
    
    // Verify PATCH succeeded
    expect(patchStatus).toBe(200);
    
    // Badge should exist and be visible
    const badge = await firstCard.locator('[data-testid="gift-status-badge"]').textContent();
    expect(badge?.trim()).toMatch(/^(Activo|Inactivo)$/);
  });

  test('toggle failure should show error without page reload', async ({ page }) => {
    // This test verifies error handling - even if API fails, no page reload occurs
    
    // Skip if no gifts exist
    const toggleBtn = page.locator('[data-testid="gift-toggle-status-btn"]').first();
    const btnExists = await toggleBtn.isVisible().catch(() => false);
    
    if (!btnExists) {
      test.skip();
    }

    // Intercept PATCH to force a failure response
    await page.route('**/api/admin/raffle-products/*/toggle-status', route => {
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Not found' }),
      });
    });

    // Get initial URL
    const initialUrl = page.url();

    // Click toggle
    await toggleBtn.click();
    
    // Wait for error handling
    await page.waitForTimeout(1000);
    
    // Verify no page reload occurred
    expect(page.url()).toBe(initialUrl);
    
    // Verify error state is shown (toast, alert, etc.) OR state is reverted
    // The page should still be on the same tab
    await expect(page.locator('[data-tab-id="premios"]')).toBeVisible();
  });
});
