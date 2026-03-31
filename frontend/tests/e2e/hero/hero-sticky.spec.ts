import { test, expect } from '@playwright/test';

test.use({ baseURL: 'http://localhost:5174' });
test.setTimeout(180000);

test.describe('Hero Section Sticky Positioning', () => {
  test('hero viewport stays fixed at top while scrolling through 1200vh container', async ({ page }) => {
    await page.goto('/');

    // Wait for loading overlay to disappear and body scroll to unlock
    await page.waitForFunction(
      () => {
        const overlay = document.querySelector('[data-component="LoadingOverlay"]');
        return !overlay || (overlay as HTMLElement).style.display === 'none' || !overlay.getBoundingClientRect().height;
      },
      null,
      { timeout: 180000 }
    );
    await page.waitForFunction(() => document.body.style.overflow !== 'hidden', null, { timeout: 30000 });

    const heroViewport = page.locator('[data-component="HeroViewport"]');
    await expect(heroViewport).toBeVisible();

    const viewportHeight = await page.evaluate(() => window.innerHeight);
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), viewportHeight * 6);
    await page.waitForTimeout(500);

    const boundingBox = await heroViewport.boundingBox();
    expect(boundingBox).not.toBeNull();
    expect(boundingBox!.y).toBeCloseTo(0, 0);
  });

  test('hero viewport is exactly 100vh height', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => {
        const overlay = document.querySelector('[data-component="LoadingOverlay"]');
        return !overlay || !overlay.getBoundingClientRect().height;
      },
      null,
      { timeout: 180000 }
    );
    await page.waitForFunction(() => document.body.style.overflow !== 'hidden', null, { timeout: 30000 });

    const heroViewport = page.locator('[data-component="HeroViewport"]');
    await expect(heroViewport).toBeVisible();

    const viewportHeight = await page.evaluate(() => window.innerHeight);
    const boundingBox = await heroViewport.boundingBox();
    expect(boundingBox).not.toBeNull();
    expect(boundingBox!.height).toBeCloseTo(viewportHeight, 0);
  });

  test('hero section scrolls past after 1200vh container', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => {
        const overlay = document.querySelector('[data-component="LoadingOverlay"]');
        return !overlay || !overlay.getBoundingClientRect().height;
      },
      null,
      { timeout: 180000 }
    );
    await page.waitForFunction(() => document.body.style.overflow !== 'hidden', null, { timeout: 30000 });

    const viewportHeight = await page.evaluate(() => window.innerHeight);
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), viewportHeight * 12.5);
    await page.waitForTimeout(500);

    const heroViewport = page.locator('[data-component="HeroViewport"]');
    const boundingBox = await heroViewport.boundingBox();
    expect(boundingBox).not.toBeNull();
    const viewportBottom = boundingBox!.y + boundingBox!.height;
    expect(viewportBottom).toBeLessThanOrEqual(viewportHeight * 0.5);
  });

  test('scroll progress advances through the hero section', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => {
        const overlay = document.querySelector('[data-component="LoadingOverlay"]');
        return !overlay || !overlay.getBoundingClientRect().height;
      },
      null,
      { timeout: 180000 }
    );
    await page.waitForFunction(() => document.body.style.overflow !== 'hidden', null, { timeout: 30000 });

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
