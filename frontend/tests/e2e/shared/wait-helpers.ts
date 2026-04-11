import { Page, Locator, expect } from '@playwright/test';

export async function waitForAppReady(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle');
}

export async function navigateToSorteo(page: Page) {
  await page.goto('/backoffice/sorteo');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('[data-ui="sorteo-page"]')).toBeVisible({ timeout: 15000 });
}

export async function navigateToPremiosTab(page: Page) {
  await page.locator('[data-tab-id="premios"]').click();
  await expect(page.locator('[data-testid="custom-mode-toggle"]')).toBeVisible({ timeout: 10000 });
}

export async function navigateToRafflePage(page: Page) {
  await page.goto('/raffle');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('[data-testid="raffle-page"]')).toBeVisible({ timeout: 20000 });
}

export async function waitForGiftsLoaded(page: Page) {
  const spinner = page.locator('[data-ui="premios-loading"]');
  if (await spinner.isVisible({ timeout: 2000 }).catch(() => false)) {
    await expect(spinner).not.toBeVisible({ timeout: 10000 });
  }
}

export async function waitForGiftsGrid(page: Page) {
  await waitForGiftsLoaded(page);
  const grid = page.locator('[data-testid="gifts-grid"]');
  const emptyState = page.locator('[data-testid="gifts-empty-state"]');
  await expect(grid.or(emptyState)).toBeVisible({ timeout: 10000 });
}

export async function waitForGiftCards(page: Page, minCount: number = 1) {
  await waitForGiftsLoaded(page);
  const cards = page.locator('[data-testid^="gift-card-"]');
  await expect(cards.first()).toBeVisible({ timeout: 10000 });
  const count = await cards.count();
  expect(count).toBeGreaterThanOrEqual(minCount);
  return cards;
}

export async function waitForGiftCard(page: Page, index = 0): Promise<Locator> {
  await waitForGiftsLoaded(page);
  const cards = page.locator('[data-testid^="gift-card-"]');
  await expect(cards.nth(index)).toBeVisible({ timeout: 10000 });
  return cards.nth(index);
}

export async function waitForGiftsCount(page: Page, expectedCount: number) {
  const cards = page.locator('[data-testid^="gift-card-"]');
  await expect(cards).toHaveCount(expectedCount, { timeout: 10000 });
}

export async function waitForModalOpen(page: Page, testId: string) {
  await expect(page.locator(`[data-testid="${testId}"]`)).toBeVisible({ timeout: 5000 });
}

export async function waitForModalClose(page: Page, testId: string) {
  await expect(page.locator(`[data-testid="${testId}"]`)).not.toBeVisible({ timeout: 10000 });
}

export async function waitForApiResponse(page: Page, urlPattern: RegExp, timeout = 10000) {
  await page.waitForResponse(
    (resp) => urlPattern.test(resp.url()),
    { timeout }
  );
}

export async function getModeLabelText(page: Page): Promise<string> {
  const label = page.locator('[data-testid="mode-label"]');
  await expect(label).toBeVisible({ timeout: 5000 });
  return (await label.textContent()) || '';
}
