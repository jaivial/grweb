import { defineConfig, devices, test, expect } from '@playwright/experimental-ct-react';
import path from 'path';
import { fileURLToPath } from 'url';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './src',
  testMatch: '**/*.spec.ct.tsx',
  testIgnore: '**/*.stories.tsx',
  ctTemplateDir: path.resolve(__dirname, './playwright'),
  
  ctViteConfig: {
    plugins: [react()],
  },

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
