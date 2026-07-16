import 'server-only';
import type Stripe from 'stripe';
import { serviceClient } from '@/lib/integrations/google';

function period(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  return {
    current_period_start: item ? new Date(item.current_period_start * 1000).toISOString() : null,
    current_period_end: item ? new Date(item.current_period_end * 1000).toISOString() : null,
  };
}

export async function reconcileStripeSubscription(subscription: Stripe.Subscription) {
  const organizationId = subscription.metadata.organizationId;
  if (!organizationId) return;
  const supabase = serviceClient();
  const planKey = subscription.metadata.planKey || 'founding_15';
  const status = subscription.status === 'canceled' || subscription.status === 'unpaid' ? subscription.status : subscription.status;
  const saved = await supabase.from('subscriptions').upsert({
    organization_id: organizationId,
    stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    stripe_subscription_id: subscription.id,
    plan_key: planKey,
    status,
    ...period(subscription),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id' });
  if (saved.error) throw new Error(saved.error.message);
  const accountStatus = ['active','trialing'].includes(subscription.status) ? 'active' : subscription.status === 'past_due' ? 'paused' : 'paused';
  await supabase.from('organizations').update({ plan_key: planKey, account_status: accountStatus, updated_at: new Date().toISOString() }).eq('id', organizationId);
}
