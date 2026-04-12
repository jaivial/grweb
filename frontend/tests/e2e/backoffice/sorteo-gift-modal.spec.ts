import { test, expect } from '@playwright/test';
import { loginViaApi } from '../shared/auth.helpers';

/**
 * E2E test to verify gift edit modal functionality.
 * 
 * Tests:
 * 1. Clicking edit button opens modal with pre-filled data
 * 2. Clicking gift card also opens modal with pre-filled data
 * 3. Modal contains toggle visibility option (data-testid="gift-status-toggle")
 * 4. Modal contains delete option (data-testid="gift-delete-btn")
 * 5. Modal has working cancel button (data-testid="gift-cancel-btn")
 */

test.describe('Gift Edit Modal', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto('/backoffice/sorteo');
    await page.waitForLoadState('domcontentloaded');
    
    // Navigate to premios tab
    await page.locator('[data-tab-id="premios"]').click();
    await page.waitForLoadState('networkidle');
  });

  test('clicking edit button should open modal with pre-filled gift data', async ({ page }) => {
    // Skip if no gifts exist
    const editBtn = page.locator('[data-testid="gift-edit-btn"]').first();
    const btnExists = await editBtn.isVisible().catch(() => false);
    
    if (!btnExists) {
      test.skip();
    }

    // Get first gift card data before opening modal
    const firstCard = page.locator('[data-testid^="gift-card-"]').first();
    const giftTitle = await firstCard.locator('[data-testid="gift-title"]').textContent();

    // Click edit button
    await editBtn.click();
    
    // Modal should open
    const modal = page.locator('[data-testid="gift-form-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    
    // Modal should have title input pre-filled with gift title
    const titleInput = page.locator('[data-testid="gift-title-input"]');
    await expect(titleInput).toBeVisible();
    const inputValue = await titleInput.inputValue();
    expect(inputValue).toBe(giftTitle?.trim());
  });

  test('clicking gift card should open modal with pre-filled gift data', async ({ page }) => {
    // Skip if no gifts exist
    const giftCard = page.locator('[data-testid^="gift-card-"]').first();
    const cardExists = await giftCard.isVisible().catch(() => false);
    
    if (!cardExists) {
      test.skip();
    }

    // Get gift data before opening modal
    const giftTitle = await giftCard.locator('[data-testid="gift-title"]').textContent();

    // Click on gift card (not the edit button)
    await giftCard.click();
    
    // Modal should open
    const modal = page.locator('[data-testid="gift-form-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    
    // Modal should have title pre-filled
    const titleInput = page.locator('[data-testid="gift-title-input"]');
    await expect(titleInput).toBeVisible();
    const inputValue = await titleInput.inputValue();
    expect(inputValue).toBe(giftTitle?.trim());
  });

  test('edit modal should contain visibility toggle option', async ({ page }) => {
    const editBtn = page.locator('[data-testid="gift-edit-btn"]').first();
    const btnExists = await editBtn.isVisible().catch(() => false);
    
    if (!btnExists) {
      test.skip();
    }

    await editBtn.click();
    
    const modal = page.locator('[data-testid="gift-form-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    
    // Modal should have a visibility toggle checkbox with testid
    const visibilityToggle = page.locator('[data-testid="gift-status-toggle"]');
    await expect(visibilityToggle).toBeVisible();
    
    // The visible text is in the label span - get it via the parent container
    const toggleLabel = modal.locator('[data-ui="gift-toggle-label"]');
    await expect(toggleLabel).toBeVisible();
    
    // Should show current state (Activo/Inactivo)
    const statusText = await toggleLabel.textContent();
    expect(statusText?.trim()).toMatch(/^(Activo|Inactivo)$/);
  });

  test('edit modal should contain delete option', async ({ page }) => {
    const editBtn = page.locator('[data-testid="gift-edit-btn"]').first();
    const btnExists = await editBtn.isVisible().catch(() => false);
    
    if (!btnExists) {
      test.skip();
    }

    await editBtn.click();
    
    const modal = page.locator('[data-testid="gift-form-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    
    // Modal should have a delete button with testid - scope to modal to avoid picking up card-level buttons
    const deleteBtn = modal.locator('[data-testid="gift-delete-btn"]');
    await expect(deleteBtn).toBeVisible();
  });

  test('modal should have working cancel button with testid', async ({ page }) => {
    const editBtn = page.locator('[data-testid="gift-edit-btn"]').first();
    const btnExists = await editBtn.isVisible().catch(() => false);
    
    if (!btnExists) {
      test.skip();
    }

    await editBtn.click();
    
    const modal = page.locator('[data-testid="gift-form-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    
    // Cancel button should have explicit testid
    const cancelBtn = page.locator('[data-testid="gift-cancel-btn"]');
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();
    
    // Modal should close
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });
});
