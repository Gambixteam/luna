'use client';

import { useEffect, useState } from 'react';
import { authorizedFetch, getBrowserSupabase } from '@/lib/supabase/browser';

export default function BillingPage() {
  const [organization, setOrganization] = useState<Record<string, any> | null>(null);
  const [subscription, setSubscription] = useState<Record<string, any> | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    getBrowserSupabase().then(async (supabase) => {
      const session = await supabase.auth.getSession(); if (!session.data.session?.user) return void (window.location.href = '/login');
      const membership = await supabase.from('organization_memberships').select('organization_id').eq('user_id', session.data.session.user.id).limit(1).maybeSingle();
      if (!membership.data) return void (window.location.href = '/dashboard');
      const [org, sub] = await Promise.all([supabase.from('organizations').select('*').eq('id', membership.data.organization_id).single(), supabase.from('subscriptions').select('*').eq('organization_id', membership.data.organization_id).maybeSingle()]);
      setOrganization(org.data ?? null); setSubscription(sub.data ?? null);
      const params = new URLSearchParams(window.location.search); if (params.get('checkout') === 'success') setMessage('Your checkout completed. Stripe is confirming the subscription.'); if (params.get('checkout') === 'canceled') setMessage('Checkout was canceled.');
    }).catch((error) => setMessage(error instanceof Error ? error.message : 'Billing could not load.'));
  }, []);

  async function checkout(planKey: string) {
    setBusy(planKey); setMessage('');
    try { const response = await authorizedFetch('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ planKey }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? 'Checkout failed.'); window.location.href = payload.checkoutUrl; }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Checkout failed.'); setBusy(''); }
  }

  return <main className="google-setup-page"><section className="google-setup-card">
    <a className="app-brand" href="/dashboard"><span className="app-brand-mark">L</span><span>Luna <small>Billing</small></span></a>
    <div><span className="kicker">Plan and subscription</span><h1>Choose the execution level your market requires.</h1><p>Paid checkout activates after Stripe confirms the subscription. Scale remains a custom Gambix proposal.</p></div>
    {message && <div className="notice">{message}</div>}
    <section className="metric-row"><article className="metric"><span>Current plan</span><strong>{String(organization?.plan_key ?? 'founding_15').replaceAll('_',' ')}</strong><small>{subscription?.status ?? organization?.account_status ?? 'pilot'}</small></article><article className="metric"><span>Renewal</span><strong>{organization?.renewal_date ?? '—'}</strong><small>Managed by Gambix</small></article></section>
    <div className="plan-grid billing-plans"><article><span>Core</span><h3>$750<small>/month</small></h3><p>One monthly content asset, local SEO foundation, GBP activity, citations and reporting.</p><button className="app-button" disabled={Boolean(busy)} onClick={() => checkout('luna_core')}>{busy === 'luna_core' ? 'Opening checkout…' : 'Choose Core'}</button></article><article className="featured"><div className="popular">Expanded execution</div><span>Plus</span><h3>$1,250<small>/month</small></h3><p>Two content assets, expanded optimization, competitive visibility and priority support.</p><button className="app-button" disabled={Boolean(busy)} onClick={() => checkout('luna_plus')}>{busy === 'luna_plus' ? 'Opening checkout…' : 'Choose Plus'}</button></article><article><span>Scale</span><h3>Custom</h3><p>Multi-location, advanced technical SEO, call tracking, custom analytics and executive reporting.</p><a className="secondary-button" href="https://gambix.io/contact">Request proposal</a></article></div>
    <a className="secondary-button" href="/dashboard">Return to Luna</a>
  </section></main>;
}
