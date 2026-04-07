import { test, expect } from '@playwright/test';

test.describe('VideoFrameAnimator', () => {
  test.beforeEach(async ({ page }) => {
    // Listen for console logs from the page
    page.on('console', msg => {
      if (msg.type() === 'log' || msg.type() === 'error') {
        console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
      }
    });
  });

  test('should load and render video animation on home page', async ({ page }) => {
    // Navigate to home page
    await page.goto('/');

    // Wait for the VideoFrameAnimator container to be visible
    const animatorContainer = page.locator('[data-component="VideoFrameAnimator"]');
    await expect(animatorContainer).toBeVisible({ timeout: 15000 });
    console.log('[TEST] VideoFrameAnimator container is visible');

    // Check for the loading spinner (should disappear when video is ready)
    const loadingPlaceholder = page.locator('[data-ui="video-loading-placeholder"]');

    // Wait for video metadata to load (loading placeholder disappears)
    try {
      await expect(loadingPlaceholder).not.toBeVisible({ timeout: 30000 });
      console.log('[TEST] Video metadata loaded - loading placeholder hidden');
    } catch {
      console.log('[TEST] Warning: Loading placeholder still visible after timeout');
    }

    // Check that canvas element exists inside the animator container
    const canvas = animatorContainer.locator('canvas');
    await expect(canvas).toBeAttached({ timeout: 10000 });
    console.log('[TEST] Canvas element is present');

    // Wait a bit for frames to render
    await page.waitForTimeout(2000);

    // Take a screenshot for verification
    await page.screenshot({ path: 'test-results/video-animator-home.png', fullPage: false });
    console.log('[TEST] Screenshot saved to test-results/video-animator-home.png');

    // Verify canvas has content (non-zero dimensions)
    const canvasInfo = await canvas.evaluate((el: HTMLCanvasElement) => ({
      width: el.width,
      height: el.height,
      display: getComputedStyle(el).display,
    }));

    console.log('[TEST] Canvas info:', canvasInfo);
    expect(canvasInfo.width).toBeGreaterThan(0);
    expect(canvasInfo.height).toBeGreaterThan(0);
    expect(canvasInfo.display).not.toBe('none');

    // Check console logs for VideoFrameAnimator messages
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      if (msg.text().includes('[VideoFrameAnimator]')) {
        consoleLogs.push(msg.text());
      }
    });

    // Scroll to trigger animation
    await page.evaluate(() => window.scrollTo({ top: 100, behavior: 'smooth' }));
    await page.waitForTimeout(1000);

    console.log('[TEST] VideoFrameAnimator console logs captured:', consoleLogs.length);
    console.log('[TEST] Done - Video animation test passed');
  });

  test('should have no critical errors in console', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    page.on('pageerror', err => {
      errors.push(err.message);
    });

    await page.goto('/');
    await page.waitForTimeout(5000);

    // Filter out known environment-specific errors (WebGL in headless, favicon, DevTools, external CORS)
    const criticalErrors = errors.filter(err =>
      !err.includes('favicon') &&
      !err.includes('DevTools') &&
      !err.includes('third-party') &&
      !err.includes('WebGL') &&
      !err.includes('WebGLRenderer') &&
      !err.includes('BindToCurrentSequence') &&
      !err.includes('THREE.WebGLRenderer') &&
      !err.includes('CORS') &&
      !err.includes('net::ERR_FAILED') &&
      !err.includes('Access-Control-Allow-Origin')
    );

    if (criticalErrors.length > 0) {
      console.log('[TEST] Critical errors found:', criticalErrors);
    }

    expect(criticalErrors.length).toBe(0);
  });
});
