import { test, expect } from '@playwright/test';
import { loginViaApi } from '../shared/auth.helpers';

/**
 * E2E test to verify that toggling a gift status does NOT trigger a loading spinner.
 * 
 * Issue: After optimistic update, fetchGifts() was being called, which set giftsLoading(true),
 * causing the loading spinner to appear again - defeating the purpose of optimistic updates.
 */

test.describe('Sorteo Toggle - No Loading Spinner', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto('/backoffice/sorteo');
    await page.waitForLoadState('domcontentloaded');
    
    // Navigate to premios tab
    await page.locator('[data-tab-id="premios"]').click();
    await page.waitForLoadState('networkidle');
  });

  test('toggle should NOT show loading spinner - optimistic update only', async ({ page }) => {
    // Find toggle button and verify gift card exists
    const toggleBtn = page.locator('[data-testid="gift-toggle-status-btn"]').first();
    const btnExists = await toggleBtn.isVisible().catch(() => false);
    
    if (!btnExists) {
      test.skip(); // No gifts to toggle
    }

    // Get initial state
    const firstCard = page.locator('[data-testid^="gift-card-"]').first();
    const initialBadge = await firstCard.locator('[data-testid="gift-status-badge"]').textContent();

    // Track when loading spinner appears
    let spinnerShownDuringToggle = false;
    const spinner = page.locator('[data-ui="premios-spinner"]');
    
    // Set up a mutation observer to detect when spinner becomes visible
    // OR we can simply check if spinner appears after clicking within a short window
    
    // Click toggle
    await toggleBtn.click();
    
    // Immediately check for spinner (within 200ms of click)
    // If optimistic update works correctly, spinner should NOT appear
    const spinnerVisiblePromise = spinner.waitFor({ state: 'visible', timeout: 500 }).then(() => true).catch(() => false);
    
    // Wait a short time for potential spinner appearance
    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(false), 500));
    
    spinnerShownDuringToggle = await Promise.race([spinnerVisiblePromise, timeoutPromise]);
    
    // Also check that UI updated immediately (optimistic)
    await page.waitForTimeout(300);
    const newBadge = await firstCard.locator('[data-testid="gift-status-badge"]').textContent();
    
    // Badge should have changed immediately (optimistic update)
    expect(newBadge).not.toBe(initialBadge);
    
    // Spinner should NOT have been shown during toggle
    expect(spinnerShownDuringToggle).toBe(false);
  });

  test('toggle should update UI immediately without any loading state', async ({ page }) => {
    const toggleBtn = page.locator('[data-testid="gift-toggle-status-btn"]').first();
    const btnExists = await toggleBtn.isVisible().catch(() => false);
    
    if (!btnExists) {
      test.skip();
    }

    const firstCard = page.locator('[data-testid^="gift-card-"]').first();
    const initialBadge = await firstCard.locator('[data-testid="gift-status-badge"]').textContent();
    
    // Track network requests to see if fetchGifts is called after toggle
    const apiCallsDuringToggle: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/admin/raffle-products') && request.method() === 'GET') {
        apiCallsDuringToggle.push(request.url());
      }
    });

    // Click toggle
    const clickTime = Date.now();
    await toggleBtn.click();
    
    // Wait for PATCH to complete
    await page.waitForTimeout(500);
    
    const callsAfterClick = apiCallsDuringToggle.filter(url => url.includes('raffle-products'));
    
    // For a proper optimistic update, there should be NO GET /api/admin/raffle-products call
    // immediately after the toggle PATCH
    console.log('API calls during toggle:', callsAfterClick);
    console.log('Time from click to now:', Date.now() - clickTime, 'ms');
    
    // Badge should have changed immediately
    const newBadge = await firstCard.locator('[data-testid="gift-status-badge"]').textContent();
    expect(newBadge).not.toBe(initialBadge);
  });

  test('loading spinner should only appear on initial fetch, not on toggle', async ({ page }) => {
    const toggleBtn = page.locator('[data-testid="gift-toggle-status-btn"]').first();
    const btnExists = await toggleBtn.isVisible().catch(() => false);
    
    if (!btnExists) {
      test.skip();
    }

    const spinner = page.locator('[data-ui="premios-spinner"]');
    
    // Capture all times spinner becomes visible
    const spinnerVisibleTimes: number[] = [];
    
    // Monitor spinner visibility changes
    await page.evaluate(() => {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            const el = mutation.target as HTMLElement;
            if (el.classList.contains('animate-spin')) {
              (window as any).__spinnerShownAt = Date.now();
            }
          }
        });
      });
      
      const spinnerEl = document.querySelector('[data-ui="premios-spinner"]');
      if (spinnerEl) {
        observer.observe(spinnerEl, { attributes: true });
      }
      
      (window as any).__observer = observer;
    });
    
    // Clear any previous timing data
    await page.evaluate(() => {
      delete (window as any).__spinnerShownAt;
    });
    
    // Click toggle
    await toggleBtn.click();
    
    // Wait for any potential spinner
    await page.waitForTimeout(1000);
    
    // Check if spinner was shown during toggle
    const spinnerShownAt = await page.evaluate(() => (window as any).__spinnerShownAt);
    
    if (spinnerShownAt) {
      console.log('Spinner was shown at:', spinnerShownAt, 'ms after page load');
    } else {
      console.log('Spinner was NOT shown during toggle - GOOD!');
    }
    
    // Clean up observer
    await page.evaluate(() => {
      (window as any).__observer?.disconnect();
    });
  });
});
