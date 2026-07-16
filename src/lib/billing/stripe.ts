import 'server-only';
import Stripe from 'stripe';

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function createStripeClient() {
  return new Stripe(required('STRIPE_SECRET_KEY'), { appInfo: { name: 'Luna by Gambix', version: '0.2.0' } });
}

export function getStripeWebhookSecret() {
  return required('STRIPE_WEBHOOK_SECRET');
}
