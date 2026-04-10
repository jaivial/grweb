/**
 * Seed admin session for Playwright MCP / E2E tests.
 * Run once to produce `admin-state.json` containing auth cookies.
 * Usage: node seed-admin-session.mjs
 */

import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, 'admin-state.json');

const BASE_URL = 'http://localhost:5173';
const USERNAME = 'jaime@hotmail.com';
const PASSWORD = 'test123123';

async function seedSession() {
  // Use headless by default; set HEADED=1 env var for visual debugging
  const headless = !process.env.HEADED;
  console.log(`🚀 Launching ${headless ? 'headless' : 'headed'} browser...`);
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log(`📍 Navigating to ${BASE_URL}/backoffice/login`);
    await page.goto(`${BASE_URL}/backoffice/login`);

    // Fill login form
    await page.waitForSelector('input[type="text"], input[name*="user" i], input[name*="email" i], input[placeholder*="usuario" i]', { timeout: 5000 }).catch(() => null);

    // Find username and password fields - try multiple selectors
    const usernameField = page.getByLabel(/usuario/i)
      .or(page.locator('input[type="text"]').first())
      .or(page.locator('input[name*="user" i]'))
      .or(page.locator('input[name*="email" i]'))
      .first();

    const passwordField = page.getByLabel(/contraseña/i)
      .or(page.locator('input[type="password"]').first())
      .or(page.locator('input[name*="pass" i]'))
      .first();

    console.log('🔑 Filling credentials...');
    await usernameField.fill(USERNAME);
    await passwordField.fill(PASSWORD);

    // Find and click login button
    const loginButton = page.getByRole('button', { name: /entrar|login|acceder/i })
      .or(page.locator('button[type="submit"]').first())
      .first();

    console.log('➡️  Clicking login button...');
    await loginButton.click();

    // Wait for redirect to backoffice
    console.log('⏳ Waiting for redirect to /backoffice...');
    await page.waitForURL(/\/backoffice(?!\/login)/, { timeout: 10000 });

    console.log(`✅ Logged in! Current URL: ${page.url()}`);

    // Save storage state (cookies + localStorage)
    await context.storageState({ path: OUTPUT_PATH });
    console.log(`💾 Session saved to: ${OUTPUT_PATH}`);

    // Quick verification - try a protected endpoint
    const response = await page.evaluate(async () => {
      const r = await fetch('/api/admin/verify', { credentials: 'include' });
      return { ok: r.ok, status: r.status };
    });
    console.log(`🔍 Verify endpoint: ${response.ok ? '✅ AUTHENTICATED' : '❌ FAILED (' + response.status + ')'}`);

  } catch (err) {
    console.error('❌ Error during session seed:', err.message);
    await page.screenshot({ path: path.join(__dirname, 'seed-error.png') });
    console.log('📸 Screenshot saved to seed-error.png');
    process.exit(1);
  } finally {
    await browser.close();
  }

  console.log('\n✅ Done! admin-state.json ready for use with Playwright MCP.\n');
}

seedSession();
