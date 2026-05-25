import { atom } from 'jotai';

export interface StripeConfigData {
  hasSecretKey: boolean;
  publishableKey: string | null;
  hasWebhookSecret: boolean;
  activo: boolean;
}

export const stripeConfigAtom = atom<StripeConfigData | null>(null);
export const stripeConfigLoadingAtom = atom(false);
export const stripeConfigSavingAtom = atom(false);
export const stripeConfigErrorAtom = atom<string | null>(null);
