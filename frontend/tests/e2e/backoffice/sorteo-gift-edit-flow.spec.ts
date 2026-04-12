import { test, expect } from '@playwright/test';
import { loginViaApi } from '../shared/auth.helpers';

/**
 * E2E test for full gift edit flow including:
 * 1. Toggle switch in modal (not button)
 * 2. Optimistic update of status from modal toggle
 * 3. Successful PUT to update gift product
 */

test.describe('Gift Edit Flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto('/backoffice/sorteo');
    await page.waitForLoadState('domcontentloaded');
    
    // Navigate to premios tab
    await page.locator('[data-tab-id="premios"]').click();
    await page.waitForLoadState('networkidle');
  });

  test('modal should have a toggle switch for status (not a button)', async ({ page }) => {
    const editBtn = page.locator('[data-testid="gift-edit-btn"]').first();
    const btnExists = await editBtn.isVisible().catch(() => false);
    
    if (!btnExists) {
      test.skip();
    }

    await editBtn.click();
    
    const modal = page.locator('[data-testid="gift-form-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    
    // Should have a toggle switch (role=switch or a checkbox styled as switch)
    // The data-testid should be gift-status-toggle
    const toggle = page.locator('[data-testid="gift-status-toggle"]');
    await expect(toggle).toBeVisible();
    
    // Verify it's a toggle switch role, not just a button
    const role = await toggle.getAttribute('role').catch(() => null);
    const type = await toggle.getAttribute('type').catch(() => null);
    
    // Either role="switch" or it's a checkbox that acts as a switch
    const isToggleSwitch = role === 'switch' || (type === 'checkbox');
    expect(isToggleSwitch).toBeTruthy();
  });

  test('toggling status from modal should update optimistically without loading spinner', async ({ page }) => {
    const editBtn = page.locator('[data-testid="gift-edit-btn"]').first();
    const btnExists = await editBtn.isVisible().catch(() => false);
    
    if (!btnExists) {
      test.skip();
    }

    // Get first card initial state
    const firstCard = page.locator('[data-testid^="gift-card-"]').first();
    const cardBadgeBefore = await firstCard.locator('[data-testid="gift-status-badge"]').textContent();
    const initialIsActive = cardBadgeBefore?.trim().toLowerCase().includes('activo');

    await editBtn.click();
    
    const modal = page.locator('[data-testid="gift-form-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    
    // Get modal toggle state
    const toggle = modal.locator('[data-testid="gift-status-toggle"]');
    const toggleTextBefore = await toggle.textContent();
    
    // Track API calls
    const patchRequests: { url: string; status: number }[] = [];
    page.on('response', async response => {
      if (response.request().method() === 'PATCH' && response.url().includes('toggle-status')) {
        patchRequests.push({ url: response.url(), status: response.status() });
      }
    });

    // Click the toggle
    await toggle.click();
    
    // Wait a bit for the optimistic update to happen
    await page.waitForTimeout(200);
    
    // Toggle text should have changed
    const toggleTextAfter = await toggle.textContent();
    expect(toggleTextAfter).not.toBe(toggleTextBefore);
    
    // Verify PATCH was called
    expect(patchRequests.length).toBeGreaterThan(0);
    expect(patchRequests[0].status).toBe(200);
  });

  test('editing gift product should succeed with PUT request', async ({ page }) => {
    const editBtn = page.locator('[data-testid="gift-edit-btn"]').first();
    const btnExists = await editBtn.isVisible().catch(() => false);
    
    if (!btnExists) {
      test.skip();
    }

    // Get first card data
    const firstCard = page.locator('[data-testid^="gift-card-"]').first();
    const giftTitle = await firstCard.locator('[data-testid="gift-title"]').textContent();

    await editBtn.click();
    
    const modal = page.locator('[data-testid="gift-form-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    
    // Clear and type new title
    const titleInput = modal.locator('[data-testid="gift-title-input"]');
    await titleInput.clear();
    const newTitle = 'Edited Title ' + Date.now();
    await titleInput.fill(newTitle);
    
    // Track PUT request
    const putPromise = page.waitForResponse(resp => 
      resp.request().method() === 'PUT' && resp.url().includes('/api/admin/raffle-products/'),
      { timeout: 15000 }
    );
    
    // Click save
    const saveBtn = modal.locator('[data-testid="gift-save-btn"]');
    await saveBtn.click();
    
    // Wait for PUT response
    const putResponse = await putPromise;
    
    // Verify PUT succeeded (not 500)
    console.log('PUT status:', putResponse.status());
    console.log('PUT url:', putResponse.url());
    
    expect(putResponse.status()).toBe(200);
    
    // Modal should close
    await expect(modal).not.toBeVisible({ timeout: 5000 });
    
    // Card should show new title
    await page.waitForTimeout(500);
    const updatedCard = page.locator('[data-testid^="gift-card-"]').first();
    const updatedTitle = await updatedCard.locator('[data-testid="gift-title"]').textContent();
    expect(updatedTitle?.trim()).toBe(newTitle);
  });

  test('edit flow - full happy path: open modal, toggle status, edit title, save', async ({ page }) => {
    const editBtn = page.locator('[data-testid="gift-edit-btn"]').first();
    const btnExists = await editBtn.isVisible().catch(() => false);
    
    if (!btnExists) {
      test.skip();
    }

    const firstCard = page.locator('[data-testid^="gift-card-"]').first();
    const originalTitle = await firstCard.locator('[data-testid="gift-title"]').textContent();
    const originalBadge = await firstCard.locator('[data-testid="gift-status-badge"]').textContent();

    // Open modal
    await editBtn.click();
    const modal = page.locator('[data-testid="gift-form-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    
    // Toggle status first
    const toggle = modal.locator('[data-testid="gift-status-toggle"]');
    const toggleBefore = await toggle.textContent();
    await toggle.click();
    await page.waitForTimeout(300);
    const toggleAfter = await toggle.textContent();
    expect(toggleAfter).not.toBe(toggleBefore);
    
    // Edit title
    const titleInput = modal.locator('[data-testid="gift-title-input"]');
    const editedTitle = 'Updated ' + Date.now();
    await titleInput.clear();
    await titleInput.fill(editedTitle);
    
    // Save
    const saveBtn = modal.locator('[data-testid="gift-save-btn"]');
    await saveBtn.click();
    
    // Wait for modal to close
    await expect(modal).not.toBeVisible({ timeout: 10000 });
    
    // Verify the card was updated
    await page.waitForTimeout(500);
    const updatedCard = page.locator('[data-testid^="gift-card-"]').first();
    const newTitle = await updatedCard.locator('[data-testid="gift-title"]').textContent();
    expect(newTitle?.trim()).toBe(editedTitle);
  });
});
