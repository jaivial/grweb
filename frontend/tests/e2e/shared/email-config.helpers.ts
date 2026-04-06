import { Page } from '@playwright/test';
import { TEST_CREDENTIALS } from './api.helpers';

const API_URL = process.env.API_URL || 'http://localhost:5006';

export interface EmailConfigSeed {
  mainProvider: number;
  gmailAddress: string | null;
  gmailAppPassword: string | null;
  smtpUsername: string | null;
  smtpPassword: string | null;
  smtpEmailAddress: string | null;
  smtpHost: string | null;
  smtpPort: number;
}

export const SEED_EMAIL_CONFIG_GMAIL: EmailConfigSeed = {
  mainProvider: 1,
  gmailAddress: 'test@gmail.com',
  gmailAppPassword: 'test-app-password-1234',
  smtpUsername: null,
  smtpPassword: null,
  smtpEmailAddress: null,
  smtpHost: null,
  smtpPort: 0,
};

export const SEED_EMAIL_CONFIG_SMTP: EmailConfigSeed = {
  mainProvider: 0,
  gmailAddress: null,
  gmailAppPassword: null,
  smtpUsername: 'smtpuser@example.com',
  smtpPassword: 'smtp-password-123',
  smtpEmailAddress: 'noreply@example.com',
  smtpHost: 'smtp.gmail.com',
  smtpPort: 587,
};

/**
 * Seeds email config via API from browser context.
 * Requires authentication (call loginViaApi first).
 */
export async function seedEmailConfig(page: Page, config: EmailConfigSeed): Promise<void> {
  await page.evaluate(async (cfg) => {
    const baseUrl = window.location.origin;
    const response = await fetch(`${baseUrl}/api/admin/email-config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('gr_cup_token') || ''}`,
      },
      credentials: 'include',
      body: JSON.stringify(cfg),
    });

    if (!response.ok) {
      throw new Error(`Failed to seed email config: ${response.status}`);
    }
  }, config);
}

/**
 * Clears email config via API from browser context.
 * Requires authentication (call loginViaApi first).
 */
export async function clearEmailConfig(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const baseUrl = window.location.origin;
    const response = await fetch(`${baseUrl}/api/admin/email-config`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('gr_cup_token') || ''}`,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      // 404 is fine - means no config existed
      if (response.status !== 404) {
        throw new Error(`Failed to clear email config: ${response.status}`);
      }
    }
  });
}

/**
 * Gets email config via API from browser context.
 * Returns null if no config exists.
 */
export async function getEmailConfig(page: Page): Promise<EmailConfigSeed | null> {
  return await page.evaluate(async () => {
    const baseUrl = window.location.origin;
    const response = await fetch(`${baseUrl}/api/admin/email-config`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('gr_cup_token') || ''}`,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Failed to get email config: ${response.status}`);
    }

    return response.json();
  });
}
