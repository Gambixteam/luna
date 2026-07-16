import { NextResponse, type NextRequest } from 'next/server';
import Stripe from 'stripe';
import { createStripeClient, getStripeWebhookSecret } from '@/lib/billing/stripe';
import { serviceClient } from '@/lib/integrations/google';
import { reconcileStripeSubscription } from '@/lib/billing/reconcile';

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'missing_signature' }, { status: 400 });
  const stripe = createStripeClient();
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(await request.text(), signature, getStripeWebhookSecret()); }
  catch { return NextResponse.json({ error: 'invalid_signature' }, { status: 400 }); }

  const supabase = serviceClient();
  const persisted = await supabase.from('stripe_events').upsert({ id: event.id, event_type: event.type, livemode: event.livemode, payload: event as unknown as Record<string, unknown>, processed_at: new Date().toISOString() });
  if (persisted.error) return NextResponse.json({ error: 'webhook_persist_failed' }, { status: 500 });

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
      if (subscriptionId) await reconcileStripeSubscription(await stripe.subscriptions.retrieve(subscriptionId));
    }
    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      await reconcileStripeSubscription(event.data.object as Stripe.Subscription);
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'subscription_reconciliation_failed' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
