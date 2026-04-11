import { defineConfig, devices } from '@playwright/test';

// Auto-detect environment
const isCI = !!process.env.CI;
const hasDisplay = !!process.env.DISPLAY;
const useHeaded = !isCI && hasDisplay;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',

    // === DIAGNOSTICS: Always on ===
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',

    // === MODE: Auto-detect headed vs headless ===
    headless: !useHeaded,
    slowMo: useHeaded ? 50 : 0,
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
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
