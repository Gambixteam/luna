'use client';

import { useEffect, useState } from 'react';
import { authorizedFetch, getBrowserSupabase } from '@/lib/supabase/browser';

export default function ConnectGooglePage() {
  const [siteId, setSiteId] = useState('');
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    const supabase = await getBrowserSupabase();
    const session = await supabase.auth.getSession();
    if (!session.data.session?.user) return void (window.location.href = '/login');
    const membership = await supabase.from('organization_memberships').select('organization_id').eq('user_id', session.data.session.user.id).limit(1).maybeSingle();
    if (!membership.data) return void (window.location.href = '/dashboard');
    const site = await supabase.from('sites').select('id').eq('organization_id', membership.data.organization_id).limit(1).maybeSingle();
    if (!site.data) return;
    setSiteId(site.data.id);
    const integrations = await supabase.from('integrations').select('*').eq('site_id', site.data.id).in('provider', ['google_search_console','google_analytics_4','google_business_profile']).order('provider');
    setRows(integrations.data ?? []);
  }

  useEffect(() => { load().catch((error) => setMessage(error instanceof Error ? error.message : 'Unable to load setup.')); }, []);

  async function connect() {
    setBusy('connect'); setMessage('');
    try {
      const response = await authorizedFetch('/api/integrations/google/start', { method: 'POST', body: JSON.stringify({ siteId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Connection failed.');
      window.location.href = payload.authorizationUrl;
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Connection failed.'); setBusy(''); }
  }

  async function sync() {
    setBusy('sync'); setMessage('');
    try {
      const response = await authorizedFetch('/api/integrations/google/sync', { method: 'POST', body: JSON.stringify({ siteId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Sync failed.');
      setMessage(`Sync completed through ${payload.periodEnd}.`); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Sync failed.'); }
    finally { setBusy(''); }
  }

  const labels: Record<string,string> = { google_search_console: 'Search Console', google_analytics_4: 'Google Analytics 4', google_business_profile: 'Business Profile' };
  return <main className="google-setup-page"><section className="google-setup-card">
    <a className="app-brand" href="/dashboard"><span className="app-brand-mark">L</span><span>Luna <small>by Gambix</small></span></a>
    <div><span className="kicker">Google data connection</span><h1>Connect the search data Luna needs.</h1><p>Authorize Search Console, Analytics and Business Profile once, then sync verified metrics into Luna.</p></div>
    <div className="integration-grid google-status-grid">{rows.map((item) => <article className="panel" key={item.id}><h3>{labels[item.provider] ?? item.provider}</h3><span className={`connection-status ${item.status}`}>{item.status.replaceAll('_',' ')}</span><p>{item.last_successful_sync ? `Last synced ${new Date(item.last_successful_sync).toLocaleString()}` : 'Not synced yet.'}</p></article>)}</div>
    {message && <div className="notice">{message}</div>}
    <div className="button-row"><button className="app-button" onClick={connect} disabled={!siteId || Boolean(busy)}>{busy === 'connect' ? 'Opening Google…' : 'Connect Google'}</button><button className="secondary-button" onClick={sync} disabled={!siteId || Boolean(busy)}>{busy === 'sync' ? 'Syncing…' : 'Sync now'}</button><a className="secondary-button" href="/dashboard">Return to Luna</a></div>
  </section></main>;
}
