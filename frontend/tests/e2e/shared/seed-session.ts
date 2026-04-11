import type { Page } from '@playwright/test';
import { API_URL, TEST_CREDENTIALS } from './api.helpers';

export async function seedAuthenticatedSession(page: Page) {
  const ctx = page.context();
  const response = await ctx.request.post(`${API_URL}/api/admin/login`, {
    data: {
      username: TEST_CREDENTIALS.username,
      password: TEST_CREDENTIALS.password,
    },
  });

  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()} ${await response.text()}`);
  }

  const setCookie = response.headers()['set-cookie'];
  if (setCookie) {
    const match = setCookie.match(/gr_cup_token=([^;]+)/);
    if (match) {
      await ctx.addCookies([{
        name: 'gr_cup_token',
        value: match[1],
        domain: 'localhost',
        path: '/',
      }]);
    }
  }
}
