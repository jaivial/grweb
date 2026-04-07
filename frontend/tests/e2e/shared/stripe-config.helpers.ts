import { Page } from '@playwright/test';

const API_URL = process.env.API_URL || 'http://localhost:5006';

export interface StripeConfigSeed {
  secretKey: string | null;
  publishableKey: string | null;
  webhookSecret: string | null;
}

export const SEED_STRIPE_CONFIG: StripeConfigSeed = {
  secretKey: 'sk_test_1234567890abcdef1234567890',
  publishableKey: 'pk_test_1234567890abcdef1234567890',
  webhookSecret: 'whsec_test_1234567890abcdef1234567890',
};

/**
 * Seeds Stripe config via API from browser context.
 * Requires authentication (call loginViaApi first).
 */
export async function seedStripeConfig(page: Page, config: StripeConfigSeed): Promise<void> {
  await page.evaluate(async (cfg) => {
    const baseUrl = window.location.origin;
    const response = await fetch(`${baseUrl}/api/admin/stripe-config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('gr_cup_token') || ''}`,
      },
      credentials: 'include',
      body: JSON.stringify(cfg),
    });

    if (!response.ok) {
      throw new Error(`Failed to seed stripe config: ${response.status}`);
    }
  }, config);
}

/**
 * Clears Stripe config via API from browser context.
 * Requires authentication (call loginViaApi first).
 */
export async function clearStripeConfig(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const baseUrl = window.location.origin;
    const response = await fetch(`${baseUrl}/api/admin/stripe-config`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('gr_cup_token') || ''}`,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status !== 404) {
        throw new Error(`Failed to clear stripe config: ${response.status}`);
      }
    }
  });
}

/**
 * Gets Stripe config via API from browser context.
 * Returns masked keys.
 */
export async function getStripeConfig(page: Page): Promise<StripeConfigSeed | null> {
  return await page.evaluate(async () => {
    const baseUrl = window.location.origin;
    const response = await fetch(`${baseUrl}/api/admin/stripe-config`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('gr_cup_token') || ''}`,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Failed to get stripe config: ${response.status}`);
    }

    return response.json();
  });
}
