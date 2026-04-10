# Playwright Headed Testing: One-Shot Bug Detection Guide

> **For:** React + ASP.NET Core C# backends (adaptable to any stack)
>
> **Goal:** Write Playwright headed tests that catch bugs on the first run, eliminating wasteful edit-run-debug cycles.

---

## Table of Contents

1. [Philosophy](#philosophy)
2. [Project Setup](#project-setup)
3. [Essential Configuration](#essential-configuration)
4. [The Shared Utilities Layer](#the-shared-utilities-layer)
5. [Auth Seeding Done Right](#auth-seeding-done-right)
6. [The One-Shot Test Template](#the-one-shot-test-template)
7. [Wait for Outcomes, Not Timing](#wait-for-outcomes-not-timing)
8. [Network Interception & Verification](#network-interception--verification)
9. [Console & Error Monitoring](#console--error-monitoring)
10. [Handling React useEffect Race Conditions](#handling-react-useeffect-race-conditions)
11. [Common Pitfalls & Anti-Patterns](#common-pitfalls--anti-patterns)
12. [Debugging Workflow](#debugging-workflow)
13. [Reusable Template for Any Project](#reusable-template-for-any-project)

---

## Philosophy

The biggest mistake with Playwright tests is treating them like unit tests. **E2E tests are integration tests** — they verify the entire chain: frontend renders → state initializes → effects fire → API responds → UI updates.

The goal of a **one-shot test** is:
- It fails with a **clear, actionable error** on the first run
- It captures **all diagnostic info** automatically (console errors, network failures, screenshots)
- It's **deterministic** — no flakiness from timing or async race conditions

---

## Project Setup

### Directory Structure

```
frontend/
├── playwright.config.ts
├── tests/
│   └── e2e/
│       ├── shared/            # Reusable helpers (copy between projects)
│       │   ├── api.helpers.ts
│       │   ├── auth.helpers.ts
│       │   ├── console-monitor.ts
│       │   └── network-capture.ts
│       ├── sessions/          # Persisted auth state
│       │   └── admin-state.json
│       ├── backoffice/        # Test files by feature
│       │   ├── home.spec.ts
│       │   └── inscripciones.spec.ts
│       └── public/
│           └── landing.spec.ts
```

### Install

```bash
npm install -D @playwright/test playwright
npx playwright install chromium
```

---

## Essential Configuration

### `playwright.config.ts`

This config is optimized for **headed debugging** with maximum diagnostic output:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',

    // === DIAGNOSTICS: Always on for headed mode ===
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',

    // === HEADED MODE: Uncomment for debugging ===
    // headless: false,
    // slowMo: 50,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

**Key settings explained:**

| Setting | Why |
|---------|-----|
| `trace: 'on-first-retry'` | Captures full trace on retry — network calls, DOM snapshots, console |
| `video: 'retain-on-failure'` | Records the entire test session visually |
| `screenshot: 'only-on-failure'` | Instant visual of what went wrong |
| `headless: false` + `slowMo: 50` | Watch the test execute in real-time (debug mode) |

---

## The Shared Utilities Layer

### 1. API Helper (`shared/api.helpers.ts`)

Centralizes your API URL and credentials. One place to change them.

```typescript
export const API_URL = process.env.API_URL || 'http://localhost:5006';

export const TEST_CREDENTIALS = {
  username: 'jaime@hotmail.com',
  password: 'test123123',
};
```

### 2. Console Monitor (`shared/console-monitor.ts`)

Automatically catches JavaScript errors and console errors during tests:

```typescript
import { Page, ConsoleMessage } from '@playwright/test';

type ConsoleError = {
  type: 'error';
  text: string;
  location: { url: string; lineNumber: number; columnNumber: number };
};

export function monitorConsole(page: Page) {
  const errors: ConsoleError[] = [];

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      const location = msg.location();
      // Filter out known noise
      if (location.url.includes('@vite/client')) return;
      if (text.includes('style') && text.includes('mapping from style properties')) return;
      if (text.includes('cannot contain a nested')) return;
      errors.push({ type: 'error', text, location });
    }
  });

  page.on('pageerror', (err: Error) => {
    errors.push({ type: 'error', text: err.message, location: { url: '', lineNumber: 0, columnNumber: 0 } });
  });

  return {
    getErrors: () => errors,
    assertNoErrors: () => {
      if (errors.length > 0) {
        throw new Error(
          `Console errors detected:\n${errors.map(e => `  - ${e.text} (${e.location.url}:${e.location.lineNumber})`).join('\n')}`
        );
      }
    },
    clear: () => errors.splice(0, errors.length),
  };
}
```

### 3. Network Capture (`shared/network-capture.ts`)

Intercepts all API calls and records them for verification:

```typescript
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
```

---

## Auth Seeding Done Right

### The #1 cause of flaky tests

Most wasted time comes from tests that **navigate first, then try to authenticate**. The correct order:

```
1. Navigate to login page
2. Fill credentials (via UI or cookie injection)
3. Wait for redirect (confirms cookie is set)
4. NOW navigate to the page under test
```

### `shared/auth.helpers.ts`

```typescript
import { Page } from '@playwright/test';
import { TEST_CREDENTIALS } from './api.helpers';

export async function loginViaApi(page: Page): Promise<void> {
  // Step 1: Navigate to login FIRST
  await page.goto('/backoffice/login');
  await page.waitForLoadState('domcontentloaded');

  // Step 2: Fill the form (actual UI interaction — verifies login works too)
  await page.getByRole('textbox', { name: 'Username' }).fill(TEST_CREDENTIALS.username);
  await page.getByRole('textbox', { name: 'Password' }).fill(TEST_CREDENTIALS.password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Step 3: Wait for redirect = confirms cookie was set
  await page.waitForURL(/\/backoffice(?!\/login)/, { timeout: 10000 });
}

export async function logout(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/backoffice/login');
  await page.waitForLoadState('domcontentloaded');
}

export async function goToLogin(page: Page): Promise<void> {
  await page.goto('/backoffice/login');
  await page.waitForLoadState('domcontentloaded');
}
```

### Why NOT use `storageState` with pre-saved cookies?

Pre-saved cookies expire, domain changes, and don't test the actual login flow. **Always login through the UI** in your `beforeEach` — it's only ~2 seconds and validates the entire auth pipeline.

---

## The One-Shot Test Template

Every test file should follow this structure:

```typescript
import { test, expect } from '@playwright/test';
import { loginViaApi } from '../shared/auth.helpers';
import { monitorConsole } from '../shared/console-monitor';
import { captureNetwork } from '../shared/network-capture';

test.describe('Feature Name', () => {

  // --- Setup once per test ---
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
  });

  // --- Individual test ---
  test('should do X when user does Y', async ({ page }) => {
    // 1. Start monitoring
    const consoleMonitor = monitorConsole(page);
    const network = captureNetwork(page);

    // 2. Navigate to the page
    await page.goto('/backoffice/some-page');
    await page.waitForLoadState('domcontentloaded');

    // 3. Wait for the PRIMARY element to appear (this waits for all useEffects)
    await expect(page.locator('[data-testid="primary-content"]')).toBeVisible({ timeout: 15000 });

    // 4. Perform the action
    await page.getByRole('button', { name: 'Do Something' }).click();

    // 5. Wait for the RESULT (not a timeout)
    await expect(page.locator('[data-testid="result-message"]')).toBeVisible({ timeout: 10000 });

    // 6. Verify network calls happened
    network.assertNoErrors();

    // 7. Verify no console errors
    consoleMonitor.assertNoErrors();
  });
});
```

---

## Wait for Outcomes, Not Timing

### ❌ Anti-patterns (cause flakiness)

```typescript
// BAD: assumes useEffect fires in exactly 500ms
await page.click('#submit');
await page.waitForTimeout(500);
await expect(page.locator('.success')).toBeVisible();

// BAD: assumes order of useEffect execution
await page.goto('/backoffice');
await expect(page.locator('.loading')).toBeVisible();  // might skip this
await expect(page.locator('.content')).toBeVisible();

// BAD: CSS selectors that change
await page.locator('div > div:nth-child(3) > span').click();
```

### ✅ Correct patterns

```typescript
// GOOD: wait for the actual API call
await page.click('#submit');
await page.waitForResponse(resp =>
  resp.url().includes('/api/submit') && resp.status() === 200
);
await expect(page.locator('.success')).toBeVisible({ timeout: 10000 });

// GOOD: wait for the end state, ignore intermediate states
await page.goto('/backoffice');
await expect(page.locator('[data-testid="dashboard-content"]')).toBeVisible({ timeout: 15000 });

// GOOD: use data-testid attributes
await page.locator('[data-testid="submit-btn"]').click();
```

### The `waitForResponse` pattern for ASP.NET Core APIs

```typescript
// Wait for a specific endpoint
const [response] = await Promise.all([
  page.waitForResponse(resp =>
    resp.url().includes('/api/participants') && resp.status() === 200
  ),
  page.click('[data-testid="load-participants"]'),
]);

// Optionally verify the response body
const body = await response.json();
expect(body.data).toBeDefined();
```

---

## Network Interception & Verification

### Verify API calls are correct

```typescript
test('loads participants from API', async ({ page }) => {
  const network = captureNetwork(page);

  await page.goto('/backoffice/inscripciones');
  await page.waitForLoadState('networkidle');

  // Verify the correct endpoint was called
  const calls = network.getCalls();
  expect(calls.some(c => c.url.includes('/api/admin/participants'))).toBe(true);

  // Verify no 4xx/5xx errors
  network.assertNoErrors();
});
```

### Mock API responses for edge cases

```typescript
test('handles API failure gracefully', async ({ page }) => {
  // Intercept and fail the API call
  await page.route('**/api/participants*', async (route) => {
    await route.fulfill({
      status: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    });
  });

  await loginViaApi(page);
  await page.goto('/backoffice/inscripciones');
  await page.waitForLoadState('domcontentloaded');

  // Verify the app shows an error state
  await expect(page.locator('[data-testid="error-message"]')).toBeVisible({ timeout: 10000 });
});
```

---

## Console & Error Monitoring

### Always include this in every test

```typescript
test('no console errors on page load', async ({ page }) => {
  const monitor = monitorConsole(page);

  await page.goto('/backoffice/configuracion');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle');

  monitor.assertNoErrors();
});
```

### Monitor for specific expected logs

```typescript
test('logs correct state changes', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'log' && msg.text().includes('[State]')) {
      logs.push(msg.text());
    }
  });

  await page.goto('/backoffice/sorteo');
  await expect(page.locator('[data-testid="draw-content"]')).toBeVisible();

  // Verify state machine executed correctly
  expect(logs.some(l => l.includes('initialized'))).toBe(true);
});
```

---

## Handling React useEffect Race Conditions

### The Problem

React 18's concurrent rendering and multiple `useEffect` hooks fire in **non-deterministic order** during tests. Your test might check for content before the data-fetching effect completes.

### The Solution

**Never assert on intermediate states.** Only assert on the **final visible result**.

```typescript
// ❌ BAD: asserts on loading state that might be skipped
await expect(page.locator('.spinner')).toBeVisible();
await expect(page.locator('.spinner')).not.toBeVisible();
await expect(page.locator('.data-table')).toBeVisible();

// ✅ GOOD: only asserts the final state
await expect(page.locator('[data-testid="data-table"]')).toBeVisible({ timeout: 15000 });
```

### When you MUST wait for multiple effects

```typescript
test('all effects complete before interaction', async ({ page }) => {
  await page.goto('/backoffice/configuracion');

  // Wait for ALL network activity to settle (all useEffect API calls done)
  await page.waitForLoadState('networkidle');

  // Then assert the final UI state
  await expect(page.locator('[data-testid="email-form"]')).toBeVisible();
  await expect(page.locator('[data-testid="stripe-form"]')).toBeVisible();
  await expect(page.locator('[data-testid="general-form"]')).toBeVisible();
});
```

### Using `waitForFunction` for complex state

```typescript
// Wait for a Jotai atom or store to reach a specific state
await page.waitForFunction(() => {
  // This accesses your app's runtime state
  const store = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  // Or use a window property you expose in dev mode
  return (window as any).__appState?.isLoaded === true;
}, { timeout: 10000 });
```

---

## Common Pitfalls & Anti-Patterns

### 1. `waitForTimeout` instead of explicit waits

```typescript
// ❌
await page.waitForTimeout(1000);

// ✅
await expect(page.locator('[data-testid="content"]')).toBeVisible({ timeout: 5000 });
```

### 2. Testing implementation details instead of behavior

```typescript
// ❌ Testing that a specific class exists
await expect(page.locator('.flex.items-center.gap-2')).toBeVisible();

// ✅ Testing what the user sees
await expect(page.getByText('Configuration saved')).toBeVisible();
```

### 3. Not waiting for redirects

```typescript
// ❌
await page.click('[data-testid="login-btn"]');
await page.goto('/backoffice');  // Manual navigation

// ✅
await page.click('[data-testid="login-btn"]');
await page.waitForURL(/\/backoffice/, { timeout: 10000 });
```

### 4. Using brittle selectors

```typescript
// ❌ Brittle — breaks on any CSS change
await page.locator('div.container > div > button.primary').click();

// ✅ Resilient — uses accessible role
await page.getByRole('button', { name: 'Save' }).click();

// ✅ Resilient — uses data-testid
await page.locator('[data-testid="save-btn"]').click();
```

### 5. Assuming headless = headed

Headless Chrome renders differently than headed Chrome. **Always debug in headed mode first:**

```typescript
// In playwright.config.ts, for debugging:
use: {
  headless: false,
  slowMo: 50,
}
```

### 6. Not cleaning up between tests

```typescript
// Each test should be independent
test.beforeEach(async ({ page }) => {
  await loginViaApi(page);
  // Don't assume state from previous test
});
```

---

## Debugging Workflow

### Step 1: Run headed with slow motion

```bash
# In playwright.config.ts set:
#   headless: false,
#   slowMo: 100,

npx playwright test tests/e2e/backoffice/home.spec.ts --project=chromium
```

### Step 2: Watch the browser execute

You'll see exactly where it fails:
- Does login work?
- Does navigation work?
- Does content appear?
- Does an error appear?

### Step 3: Check the trace viewer on failure

```bash
npx playwright show-report
```

This shows:
- Every network call
- Every DOM snapshot
- Every console error
- Every action taken

### Step 4: Add targeted logs, re-run

If the test fails at step 3, add these to understand why:

```typescript
// Add before the failing step
console.log('Current URL:', page.url());
console.log('Page title:', await page.title());

// Check if element exists in DOM (even if not visible)
const el = await page.locator('[data-testid="target"]');
console.log('Element count:', await el.count());
```

### Step 5: Fix and verify

```bash
# Run just the one test
npx playwright test -g "should do X"

# Run the entire feature
npx playwright test tests/e2e/backoffice/
```

---

## Reusable Template for Any Project

### For a new React + C# project:

1. **Copy these three files** to your project's test directory:
   - `shared/api.helpers.ts` — change `API_URL` and `TEST_CREDENTIALS`
   - `shared/auth.helpers.ts` — update selectors to match your login form
   - `shared/console-monitor.ts` — no changes needed

2. **Create `playwright.config.ts`:**
   ```typescript
   import { defineConfig, devices } from '@playwright/test';

   export default defineConfig({
     testDir: './tests/e2e',
     fullyParallel: true,
     use: {
       baseURL: 'http://localhost:5173',
       trace: 'on-first-retry',
       screenshot: 'only-on-failure',
     },
     projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
   });
   ```

3. **Add `data-testid` attributes** to your React components for anything a test needs to interact with:
   ```tsx
   <button data-testid="save-btn" onClick={handleSave}>Save</button>
   <div data-testid="participants-table">{/* ... */}</div>
   <p data-testid="error-message">{error}</p>
   ```

4. **Write tests following the template:**
   ```typescript
   test.describe('Feature', () => {
     test.beforeEach(async ({ page }) => {
       await loginViaApi(page);
     });

     test('description', async ({ page }) => {
       const monitor = monitorConsole(page);
       const network = captureNetwork(page);

       await page.goto('/route');
       await page.waitForLoadState('domcontentloaded');
       await expect(page.locator('[data-testid="primary"]')).toBeVisible({ timeout: 15000 });

       // ... actions and assertions

       network.assertNoErrors();
       monitor.assertNoErrors();
     });
   });
   ```

### For non-.NET backends:

- Change `API_URL` to point to your backend
- Update auth helpers for your auth mechanism (JWT tokens, sessions, etc.)
- The rest is **identical** — Playwright doesn't care about your backend stack

### For non-React frontends:

- Replace `waitForLoadState('domcontentloaded')` with whatever your framework needs
- The `monitorConsole`, `captureNetwork`, and explicit wait patterns work with **any** framework
- `data-testid` attributes work universally

---

## Quick Reference Checklist

Before running a test, verify:

- [ ] `loginViaApi()` is in `beforeEach` (not manual cookie injection)
- [ ] `monitorConsole(page)` is called and `assertNoErrors()` at the end
- [ ] `captureNetwork(page)` is called and `assertNoErrors()` at the end
- [ ] All waits use `expect(locator).toBeVisible({ timeout })` — no `waitForTimeout`
- [ ] Selectors use `data-testid` or `getByRole` — no CSS class chains
- [ ] `page.waitForLoadState('domcontentloaded')` after every `page.goto()`
- [ ] `page.waitForLoadState('networkidle')` after navigation to pages with data fetching
- [ ] Test is independent — doesn't rely on state from previous tests
- [ ] Headed mode (`headless: false`) used for initial debugging

---

## Commands Cheat Sheet

```bash
# Run a single test (headed)
npx playwright test tests/e2e/backoffice/home.spec.ts --headed

# Run tests matching a name pattern
npx playwright test -g "no console errors"

# Run all backoffice tests
npx playwright test tests/e2e/backoffice/

# Run with verbose output
npx playwright test --reporter=line

# View test report (traces, screenshots, videos)
npx playwright show-report

# Run in UI mode (step through tests visually)
npx playwright test --ui

# List all tests without running
npx playwright test --list
```
