import { Page, Route } from '@playwright/test';

export type CapturedApiCall = {
  url: string;
  method: string;
  status: number;
  requestBody: unknown;
  responseBody: unknown;
};

export function captureNetwork(page: Page, pattern = '**/api/**') {
  const calls: CapturedApiCall[] = [];

  page.on('request', async (request) => {
    if (!request.url().includes('/api/') && pattern !== '**/*') return;
    // Capture happens on response (see below)
  });

  page.on('response', async (response) => {
    if (!response.url().includes('/api/') && pattern !== '**/*') return;

    let responseBody: unknown = null;
    try {
      responseBody = await response.json();
    } catch {
      // Not JSON
    }

    let requestBody: unknown = null;
    try {
      requestBody = response.request().postDataJSON();
    } catch {
      requestBody = response.request().postData();
    }

    calls.push({
      url: response.url(),
      method: response.request().method(),
      status: response.status(),
      requestBody,
      responseBody,
    });
  });

  return {
    getCalls: () => calls,
    waitForCall: async (urlPattern: RegExp, timeout = 10000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const found = calls.find(c => urlPattern.test(c.url));
        if (found) return found;
        await page.waitForTimeout(50);
      }
      throw new Error(`Timed out waiting for API call matching ${urlPattern}. Calls made: ${calls.map(c => c.url).join(', ') || 'none'}`);
    },
    assertNoErrors: () => {
      const failures = calls.filter(c => c.status >= 400);
      if (failures.length > 0) {
        throw new Error(`API failures:\n${failures.map(f => `  ${f.method} ${f.url} → ${f.status}`).join('\n')}`);
      }
    },
  };
}
