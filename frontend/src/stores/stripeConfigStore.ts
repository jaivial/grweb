import { atom } from 'jotai';

export interface StripeConfigData {
  secretKey: string | null;
  publishableKey: string | null;
  webhookSecret: string | null;
}

export const stripeConfigAtom = atom<StripeConfigData | null>(null);
export const stripeConfigLoadingAtom = atom(false);
export const stripeConfigSavingAtom = atom(false);
export const stripeConfigErrorAtom = atom<string | null>(null);
