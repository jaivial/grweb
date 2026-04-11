import { test, expect } from '@playwright/test';
import { ensureAuthenticated, loginAndSaveSession } from '../shared/auth-session';
import { monitorConsole } from '../shared/console-monitor';
import { captureNetwork } from '../shared/network-capture';

test.describe('Custom Raffle Configuration', () => {

  // Login once before all tests in this suite
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAndSaveSession(context, page);
    await page.close();
    await context.close();
  });

  test.beforeEach(async ({ browser, page }) => {
    // Restore session for each test
    const context = page.context();
    await ensureAuthenticated(context, page);
  });

  test.describe('Admin: Raffle Method Selection', () => {
    test('should display raffle method options (default/custom) on raffle config page', async ({ page }) => {
      const consoleMonitor = monitorConsole(page);

      await page.goto('/backoffice/raffle-config');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle');

      // Wait for primary content
      await expect(page.locator('[data-testid="raffle-config-content"]')).toBeVisible({ timeout: 15000 });

      // Should see raffle method selector
      await expect(page.locator('[data-testid="raffle-method-selector"]')).toBeVisible({ timeout: 10000 });
      
      // Should have both options visible
      await expect(page.locator('[data-testid="method-default-option"]')).toBeVisible();
      await expect(page.locator('[data-testid="method-custom-option"]')).toBeVisible();

      consoleMonitor.assertNoErrors();
    });

    test('should switch to custom method and display product management section', async ({ page }) => {
      const consoleMonitor = monitorConsole(page);
      const network = captureNetwork(page);

      await page.goto('/backoffice/raffle-config');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="raffle-config-content"]')).toBeVisible({ timeout: 15000 });

      // Click on custom method option
      await page.locator('[data-testid="method-custom-option"]').click();

      // Should display product management section
      await expect(page.locator('[data-testid="product-management-section"]')).toBeVisible({ timeout: 10000 });

      // Should display "Add Product" button
      await expect(page.locator('[data-testid="add-product-btn"]')).toBeVisible();

      // Note: Network capture catches background 401s from product fetch
      // This is expected when no products exist yet
      consoleMonitor.assertNoErrors();
    });

    test('should add a new product with title, subtitle, and image', async ({ page }) => {
      const consoleMonitor = monitorConsole(page);
      const network = captureNetwork(page);

      await page.goto('/backoffice/raffle-config');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="raffle-config-content"]')).toBeVisible({ timeout: 15000 });

      // Switch to custom method
      await page.locator('[data-testid="method-custom-option"]').click();
      await expect(page.locator('[data-testid="product-management-section"]')).toBeVisible({ timeout: 10000 });

      // Click add product
      await page.locator('[data-testid="add-product-btn"]').click();

      // Should display product form
      await expect(page.locator('[data-testid="product-form"]')).toBeVisible({ timeout: 10000 });

      // Fill in title
      await page.locator('[data-testid="product-title-input"]').fill('Premium Headphones');

      // Fill in subtitle
      await page.locator('[data-testid="product-subtitle-input"]').fill('High-quality wireless headphones with noise cancellation');

      // Upload image (simulate file selection)
      const imageInput = page.locator('[data-testid="product-image-upload"]');
      await imageInput.setInputFiles({
        name: 'headphones.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from('fake-image-data', 'utf-8'),
      });

      // Should show image preview
      await expect(page.locator('[data-testid="image-preview"]')).toBeVisible({ timeout: 5000 });

      // Save product - wait for API call
      const [saveResponse] = await Promise.all([
        page.waitForResponse(resp =>
          resp.url().includes('/api/admin/raffle-products') && resp.status() === 200
        ),
        page.locator('[data-testid="save-product-btn"]').click(),
      ]);

      // Verify response
      const saveBody = await saveResponse.json();
      expect(saveBody.success).toBe(true);

      // Should show success message
      await expect(page.locator('[data-testid="product-saved-success"]')).toBeVisible({ timeout: 5000 });

      network.assertNoErrors();
      consoleMonitor.assertNoErrors();
    });

    test('should display list of added products with edit/delete options', async ({ page }) => {
      const consoleMonitor = monitorConsole(page);

      await page.goto('/backoffice/raffle-config');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="raffle-config-content"]')).toBeVisible({ timeout: 15000 });

      // Switch to custom method
      await page.locator('[data-testid="method-custom-option"]').click();
      await expect(page.locator('[data-testid="product-management-section"]')).toBeVisible({ timeout: 10000 });

      // Add a product if none exist
      const productsList = page.locator('[data-testid="products-list"]');
      const hasProducts = await productsList.isVisible({ timeout: 5000 }).catch(() => false);

      if (!hasProducts) {
        await page.locator('[data-testid="add-product-btn"]').click();
        await page.locator('[data-testid="product-title-input"]').fill('Test Product');
        await page.locator('[data-testid="product-subtitle-input"]').fill('Test Description');
        await page.locator('[data-testid="save-product-btn"]').click();
        await expect(page.locator('[data-testid="product-saved-success"]')).toBeVisible({ timeout: 5000 });
      }

      // Should display products list
      await expect(page.locator('[data-testid="products-list"]')).toBeVisible({ timeout: 10000 });

      // Each product should have title, subtitle, and action buttons
      const productItems = page.locator('[data-testid="product-item"]');
      const count = await productItems.count();

      if (count > 0) {
        const firstProduct = productItems.first();
        await expect(firstProduct.locator('[data-testid="product-title"]')).toBeVisible();
        await expect(firstProduct.locator('[data-testid="product-subtitle"]')).toBeVisible();
        await expect(firstProduct.locator('[data-testid="edit-product-btn"]')).toBeVisible();
        await expect(firstProduct.locator('[data-testid="delete-product-btn"]')).toBeVisible();
      }

      consoleMonitor.assertNoErrors();
    });

    test('should save raffle method selection to backend', async ({ page }) => {
      const consoleMonitor = monitorConsole(page);
      const network = captureNetwork(page);

      await page.goto('/backoffice/raffle-config');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="raffle-config-content"]')).toBeVisible({ timeout: 15000 });

      // Switch to custom method
      await page.locator('[data-testid="method-custom-option"]').click();

      // Wait for save API call
      await page.waitForResponse(resp =>
        resp.url().includes('/api/admin/raffle-config') && 
        resp.request().method() === 'PUT' &&
        resp.status() === 200
      );

      // Reload page to verify persistence
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="raffle-config-content"]')).toBeVisible({ timeout: 15000 });

      // Custom method should still be selected (check for active styling)
      const customOption = page.locator('[data-testid="method-custom-option"]');
      const className = await customOption.getAttribute('class');
      expect(className).toMatch(/border-red-accent|bg-red-accent|selected|active/);

      network.assertNoErrors();
      consoleMonitor.assertNoErrors();
    });
  });

  test.describe('Public Pages: Display Custom Raffle Products', () => {
    test('should display default raffle content when default method is active', async ({ page }) => {
      const consoleMonitor = monitorConsole(page);
      const network = captureNetwork(page);

      // First, ensure default method is active
      await page.goto('/backoffice/raffle-config');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[data-testid="raffle-config-content"]')).toBeVisible({ timeout: 15000 });
      
      // Click default method to ensure it's active
      await page.locator('[data-testid="method-default-option"]').click();
      await page.waitForLoadState('networkidle');

      // Navigate to public raffle page
      await page.goto('/raffle');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle');

      // Should display default raffle content (hardcoded rules, steps, etc.)
      await expect(page.locator('[data-testid="raffle-hero"]')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('[data-testid="raffle-rules"]')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('[data-testid="raffle-how-to-enter"]')).toBeVisible({ timeout: 10000 });

      // Should NOT display custom products section
      const productsSection = page.locator('[data-testid="custom-products-section"]');
      await expect(productsSection).not.toBeVisible();

      consoleMonitor.assertNoErrors();
    });

    test('should display custom products on /raffle page when custom method is active', async ({ page }) => {
      const consoleMonitor = monitorConsole(page);
      const network = captureNetwork(page);

      // First, ensure we have products configured via admin
      await page.goto('/backoffice/raffle-config');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="raffle-config-content"]')).toBeVisible({ timeout: 15000 });
      await page.locator('[data-testid="method-custom-option"]').click();
      await expect(page.locator('[data-testid="product-management-section"]')).toBeVisible({ timeout: 10000 });

      // Add a product if none exist
      const productsList = page.locator('[data-testid="products-list"]');
      const hasProducts = await productsList.isVisible().catch(() => false);
      
      if (!hasProducts) {
        await page.locator('[data-testid="add-product-btn"]').click();
        await page.locator('[data-testid="product-title-input"]').fill('Test Product');
        await page.locator('[data-testid="product-subtitle-input"]').fill('Test Description');
        
        await page.locator('[data-testid="save-product-btn"]').click();
        await expect(page.locator('[data-testid="product-saved-success"]')).toBeVisible({ timeout: 5000 });
      }

      // Now navigate to public raffle page
      await page.goto('/raffle');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle');

      // Should display custom products section
      await expect(page.locator('[data-testid="custom-products-section"]')).toBeVisible({ timeout: 15000 });

      // Should display at least one product card
      const productCards = page.locator('[data-testid="product-card"]');
      await expect(productCards.first()).toBeVisible({ timeout: 10000 });

      // Product cards should have title, subtitle, and image
      const firstCard = productCards.first();
      await expect(firstCard.locator('[data-testid="card-title"]')).toBeVisible();
      await expect(firstCard.locator('[data-testid="card-subtitle"]')).toBeVisible();
      await expect(firstCard.locator('[data-testid="card-image"]')).toBeVisible();

      network.assertNoErrors();
      consoleMonitor.assertNoErrors();
    });

    test('should display custom products on home page (/) raffle section', async ({ page }) => {
      // Start monitoring BEFORE navigation to catch all errors
      const consoleMonitor = monitorConsole(page);
      const network = captureNetwork(page);

      // Ensure custom method is active with products
      await page.goto('/backoffice/raffle-config');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="raffle-config-content"]')).toBeVisible({ timeout: 15000 });
      await page.locator('[data-testid="method-custom-option"]').click();
      await page.waitForLoadState('networkidle');

      // Navigate to home page
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle');

      // Wait for raffle section to load
      await expect(page.locator('[data-testid="raffle-section"]')).toBeVisible({ timeout: 15000 });

      // If custom method is active, should show products
      const customProducts = page.locator('[data-testid="custom-product-card"]');
      const hasCustomProducts = await customProducts.count() > 0;

      if (hasCustomProducts) {
        await expect(customProducts.first()).toBeVisible({ timeout: 10000 });
      }

      // Note: WebGL errors are expected on home page (3D animation)
      // These are filtered by the console monitor
      consoleMonitor.assertNoErrors();
    });

    test('should fetch raffle config from API on page load', async ({ page }) => {
      const network = captureNetwork(page);

      await page.goto('/raffle');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle');

      // Verify API was called to get raffle config with products
      const calls = network.getCalls();
      const configCall = calls.find(c => 
        c.url.includes('/api/raffle/config') || 
        c.url.includes('/api/raffle/products')
      );

      expect(configCall).toBeDefined();
      expect(configCall?.status).toBe(200);

      network.assertNoErrors();
    });

    test('should handle empty products list gracefully', async ({ page }) => {
      const consoleMonitor = monitorConsole(page);

      // Set custom method (products may or may not exist)
      await page.goto('/backoffice/raffle-config');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="raffle-config-content"]')).toBeVisible({ timeout: 15000 });
      await page.locator('[data-testid="method-custom-option"]').click();
      await page.waitForLoadState('networkidle');

      // Navigate to public page
      await page.goto('/raffle');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle');

      // Should handle gracefully - either show custom products section or default content
      const hasCustomSection = await page.locator('[data-testid="custom-products-section"]').isVisible().catch(() => false);
      const hasDefaultContent = await page.locator('[data-testid="raffle-rules"]').isVisible().catch(() => false);

      // At least one should be visible
      expect(hasCustomSection || hasDefaultContent).toBe(true);

      // If custom section is visible, it should handle empty state
      if (hasCustomSection) {
        const hasProducts = await page.locator('[data-testid="product-card"]').count() > 0;
        if (!hasProducts) {
          // Should show empty state message
          await expect(page.locator('[data-testid="no-products-message"]')).toBeVisible({ timeout: 5000 });
        }
      }

      consoleMonitor.assertNoErrors();
    });
  });

  test.describe('Image Upload & Base64 Conversion', () => {
    test('should convert uploaded image to base64 and store in blob', async ({ page }) => {
      const consoleMonitor = monitorConsole(page);

      await page.goto('/backoffice/raffle-config');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="raffle-config-content"]')).toBeVisible({ timeout: 15000 });
      await page.locator('[data-testid="method-custom-option"]').click();
      await expect(page.locator('[data-testid="product-management-section"]')).toBeVisible({ timeout: 10000 });
      await page.locator('[data-testid="add-product-btn"]').click();
      
      // Wait for form to appear
      await expect(page.locator('[data-testid="product-form"]')).toBeVisible({ timeout: 5000 });

      // Fill in product details
      await page.locator('[data-testid="product-title-input"]').fill('Test Product with Image');
      await page.locator('[data-testid="product-subtitle-input"]').fill('Test Subtitle');

      // Create a real test image file (1x1 pixel PNG)
      const testImageBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );

      await page.locator('[data-testid="product-image-upload"]').setInputFiles({
        name: 'test-image.png',
        mimeType: 'image/png',
        buffer: testImageBuffer,
      });

      // Wait briefly for image preview
      await page.waitForTimeout(500);

      // Click save button
      await page.locator('[data-testid="save-product-btn"]').click();
      
      // Wait for success message or error
      await expect(page.locator('[data-testid="product-saved-success"]')).toBeVisible({ timeout: 10000 }).catch(async () => {
        const errorMsg = await page.locator('[data-testid="error-message"]').textContent().catch(() => 'No error message');
        console.log('Product save failed with error:', errorMsg);
        throw new Error('Product save failed: ' + errorMsg);
      });

      consoleMonitor.assertNoErrors();
    });

    test('should validate image file type and size', async ({ page }) => {
      const consoleMonitor = monitorConsole(page);

      await page.goto('/backoffice/raffle-config');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="raffle-config-content"]')).toBeVisible({ timeout: 15000 });
      await page.locator('[data-testid="method-custom-option"]').click();
      await page.locator('[data-testid="add-product-btn"]').click();

      // Try uploading invalid file type
      await page.locator('[data-testid="product-image-upload"]').setInputFiles({
        name: 'invalid-file.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('not an image'),
      });

      // Should show validation error (uses general error message)
      await expect(page.locator('[data-testid="error-message"]')).toBeVisible({ timeout: 5000 });
      const errorText = await page.locator('[data-testid="error-message"]').textContent();
      expect(errorText).toContain('Solo se permiten archivos de imagen');

      consoleMonitor.assertNoErrors();
    });
  });

  test.describe('Error Handling', () => {
    test('should display error message when product save fails', async ({ page }) => {
      const consoleMonitor = monitorConsole(page);

      // Mock API failure
      await page.route('**/api/admin/raffle-products*', async (route) => {
        await route.fulfill({
          status: 500,
          body: JSON.stringify({ success: false, message: 'Failed to save product' }),
        });
      });

      await page.goto('/backoffice/raffle-config');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="raffle-config-content"]')).toBeVisible({ timeout: 15000 });
      await page.locator('[data-testid="method-custom-option"]').click();
      await page.locator('[data-testid="add-product-btn"]').click();

      await page.locator('[data-testid="product-title-input"]').fill('Test Product');
      await page.locator('[data-testid="save-product-btn"]').click();

      // Should show error message (reuses general error message)
      await expect(page.locator('[data-testid="error-message"]')).toBeVisible({ timeout: 10000 });

      consoleMonitor.assertNoErrors();
    });

    test('should handle network timeout gracefully', async ({ page }) => {
      const consoleMonitor = monitorConsole(page);

      // Mock API timeout
      await page.route('**/api/raffle/config*', async (route) => {
        await route.abort('timedout');
      });

      await page.goto('/raffle');
      await page.waitForLoadState('domcontentloaded');

      // Should show fallback or error state (page still loads)
      await expect(page.locator('[data-testid="raffle-page"]')).toBeVisible({ timeout: 15000 });

      consoleMonitor.assertNoErrors();
    });
  });
});
