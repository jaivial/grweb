/**
 * Auth Session Seeder — Direct cookie injection for headed tests.
 * 
 * Generates a JWT token and sets it as the gr_cup_token cookie.
 * This bypasses the login UI and directly establishes an authenticated session.
 */

import { BrowserContext, expect, Page } from '@playwright/test';
import { TEST_CREDENTIALS } from './api.helpers';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import * as path from 'path';

// ES module compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SESSION_FILE = path.join(__dirname, '../sessions/admin-session.json');

/**
 * Performs login via UI and saves the session cookie.
 */
export async function loginAndSaveSession(context: BrowserContext, page: Page): Promise<void> {
  console.log('🔐 Starting login process...');
  
  // Navigate to login page
  await page.goto('/backoffice/login');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);
  
  // Fill login form
  await page.getByRole('textbox', { name: /username|email|usuario/i, exact: false }).first().fill(TEST_CREDENTIALS.username);
  await page.getByRole('textbox', { name: /password|contraseña/i, exact: false }).first().fill(TEST_CREDENTIALS.password);
  await page.getByRole('button', { name: /sign in|login|entrar/i, exact: false }).first().click();
  
  // Wait for redirect (indicates successful login)
  await page.waitForURL(/\/backoffice(?!\/login)/, { timeout: 10000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  // Get cookies from context
  const cookies = await context.cookies();
  console.log(`🍪 Found ${cookies.length} cookies after login`);
  
  // Look for our auth cookie
  const authCookie = cookies.find(c => c.name === 'gr_cup_token');
  if (authCookie) {
    console.log('✅ Auth cookie found:', authCookie.name);
  } else {
    console.log('⚠️  Auth cookie NOT found. Available cookies:', cookies.map(c => c.name).join(', '));
  }
  
  // Save all cookies
  const sessionsDir = path.dirname(SESSION_FILE);
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }
  
  const sessionData = {
    cookies,
    savedAt: new Date().toISOString(),
    hasAuthCookie: !!authCookie
  };
  
  fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2));
  console.log('💾 Session saved to:', SESSION_FILE);
}

/**
 * Ensures user is authenticated by loading saved cookies.
 */
export async function ensureAuthenticated(context: BrowserContext, page: Page): Promise<void> {
  // Try to load saved session
  if (fs.existsSync(SESSION_FILE)) {
    try {
      const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
      
      if (sessionData.cookies && sessionData.cookies.length > 0) {
        console.log('🔄 Loading saved session...');
        
        // Add cookies to context
        await context.addCookies(sessionData.cookies);
        
        // Navigate to verify session
        await page.goto('/backoffice');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(500);
        
        // Check if we're still on login page (session expired)
        const currentUrl = page.url();
        if (currentUrl.includes('/login')) {
          console.log('⚠️  Session expired, re-login needed');
          await loginAndSaveSession(context, page);
        } else {
          console.log('✅ Session restored successfully');
          return;
        }
      }
    } catch (err) {
      console.log('⚠️  Failed to load session:', err);
    }
  }
  
  // No valid session, perform fresh login
  console.log('🔐 No saved session, performing login...');
  await loginAndSaveSession(context, page);
}

/**
 * Clears saved session
 */
export function clearSavedSession(): void {
  if (fs.existsSync(SESSION_FILE)) {
    fs.unlinkSync(SESSION_FILE);
    console.log('🗑️  Cleared saved session');
  }
}
