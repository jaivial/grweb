import { test, expect } from '@playwright/test';

test.use({ baseURL: 'http://localhost:5173' });
test.setTimeout(60000);

test.describe('Hero Section Sticky Positioning', () => {
  test('page loads successfully', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    // Page should have content
    await expect(page.locator('body')).toBeVisible();
  });

  test('scroll progress advances through the page', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => document.body.style.overflow !== 'hidden',
      null,
      { timeout: 60000 }
    );

    const viewportHeight = await page.evaluate(() => window.innerHeight);

    // Use mouse.wheel for reliable scrolling
    await page.mouse.wheel(0, viewportHeight * 3);
    await page.waitForTimeout(500);

    const scrollY1 = await page.evaluate(() => window.scrollY);
    expect(scrollY1).toBeGreaterThan(0);

    await page.mouse.wheel(0, viewportHeight * 6);
    await page.waitForTimeout(500);

    const scrollY2 = await page.evaluate(() => window.scrollY);
    expect(scrollY2).toBeGreaterThan(scrollY1);
  });

  test('no horizontal scrollbar exists on the page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
  });
});
