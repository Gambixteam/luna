import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/supabase/request';
import { createStripeClient } from '@/lib/billing/stripe';

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    if (!context.organizationId) throw new Response('Complete onboarding before choosing a paid plan.', { status: 409 });
    const body = z.object({ planKey: z.enum(['luna_core','luna_plus']) }).parse(await request.json());
    const plan = await context.supabase.from('plans').select('*').eq('key', body.planKey).eq('active', true).single();
    if (plan.error || !plan.data?.monthly_price_cents) throw new Response('This plan requires a custom proposal.', { status: 409 });
    const organization = await context.supabase.from('organizations').select('*').eq('id', context.organizationId).single();
    if (organization.error || !organization.data) throw new Response('Organization not found.', { status: 404 });
    const stripe = createStripeClient();
    const lineItems: Array<Record<string, any>> = [{ price_data: { currency: 'usd', product_data: { name: `Luna ${plan.data.name}`, description: plan.data.description }, unit_amount: plan.data.monthly_price_cents, recurring: { interval: 'month' } }, quantity: 1 }];
    if (plan.data.setup_price_cents) lineItems.push({ price_data: { currency: 'usd', product_data: { name: 'Luna onboarding and setup' }, unit_amount: plan.data.setup_price_cents }, quantity: 1 });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: context.user.email,
      line_items: lineItems as any,
      success_url: `${appUrl}/billing?checkout=success`,
      cancel_url: `${appUrl}/billing?checkout=canceled`,
      allow_promotion_codes: true,
      subscription_data: { metadata: { organizationId: context.organizationId, planKey: body.planKey } },
      metadata: { organizationId: context.organizationId, planKey: body.planKey, userId: context.user.id },
    });
    return NextResponse.json({ checkoutUrl: session.url });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: error.statusText || 'Checkout failed.' }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Checkout failed.' }, { status: 400 });
  }
}
