import { NextResponse, type NextRequest } from 'next/server';
import Stripe from 'stripe';
import { createStripeClient, getStripeWebhookSecret } from '@/lib/billing/stripe';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'missing_signature' }, { status: 400 });

  const stripe = createStripeClient();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, getStripeWebhookSecret());
  } catch {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.from('stripe_events').upsert({
    id: event.id,
    event_type: event.type,
    livemode: event.livemode,
    payload: event as unknown as Record<string, unknown>,
    processed_at: new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: 'webhook_persist_failed' }, { status: 500 });

  return NextResponse.json({ received: true });
}
