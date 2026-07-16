import 'server-only';
import Stripe from 'stripe';
import { getServerEnv } from '@/lib/env';

export function createStripeClient() {
  return new Stripe(getServerEnv().STRIPE_SECRET_KEY, {
    appInfo: { name: 'Luna', version: '0.1.0' },
  });
}

export function getStripeWebhookSecret() {
  return getServerEnv().STRIPE_WEBHOOK_SECRET;
}
