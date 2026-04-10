/**
 * MCP Playwright helper: load pre-seeded admin session.
 * Usage with MCP:
 *   1. browser_new_context with storageState pointing to admin-state.json
 *   2. All subsequent pages will be authenticated as admin
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SESSION_PATH = path.join(__dirname, 'sessions', 'admin-state.json');

/**
 * Returns Playwright browser context options with pre-authenticated admin session.
 * Use with: await browser.newContext({ storageState: SESSION_PATH })
 */
export function adminContextOptions() {
  return { storageState: SESSION_PATH };
}

/**
 * Quick auth verification — call this after loading a page with admin session.
 * Returns true if /api/admin/verify returns 200.
 */
export function verifyAdminAuth(): Promise<boolean> {
  return new Promise((resolve) => {
    fetch('/api/admin/verify', { credentials: 'include' })
      .then(r => resolve(r.ok))
      .catch(() => resolve(false));
  });
}
