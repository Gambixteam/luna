'use client';

import { useEffect, useState } from 'react';
import { authorizedFetch, getBrowserSupabase } from '@/lib/supabase/browser';

export default function PublishWordPressPage() {
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    const supabase = await getBrowserSupabase(); const session = await supabase.auth.getSession();
    if (!session.data.session?.user) return void (window.location.href = '/login');
    const membership = await supabase.from('organization_memberships').select('organization_id').eq('user_id', session.data.session.user.id).limit(1).maybeSingle();
    if (!membership.data) return void (window.location.href = '/dashboard');
    const rows = await supabase.from('content_items').select('*').eq('organization_id', membership.data.organization_id).neq('content_type','gbp_post').order('created_at', { ascending: false });
    setItems(rows.data ?? []);
  }
  useEffect(() => { load().catch((error) => setMessage(error instanceof Error ? error.message : 'Content could not load.')); }, []);

  async function publish(contentId: string, publishLive: boolean) {
    setBusy(contentId); setMessage('');
    try { const response = await authorizedFetch('/api/integrations/wordpress/publish', { method: 'POST', body: JSON.stringify({ contentId, publishLive }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? 'WordPress publishing failed.'); setMessage(publishLive ? 'Approved content published live.' : 'Approved content created as a WordPress draft.'); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'WordPress publishing failed.'); }
    finally { setBusy(''); }
  }

  return <main className="google-setup-page"><section className="google-setup-card">
    <a className="app-brand" href="/dashboard"><span className="app-brand-mark">L</span><span>Luna <small>WordPress publishing</small></span></a>
    <div><span className="kicker">Approval-gated website execution</span><h1>Move approved content into WordPress.</h1><p>Create a WordPress draft for final formatting or explicitly publish live after approval.</p></div>
    {message && <div className="notice">{message}</div>}
    <div className="card-list">{items.map((item) => <article className="panel" key={item.id}><span className="kicker">{item.content_type} · {item.status}</span><h3>{item.title}</h3><p><strong>Target keyword:</strong> {item.target_keyword || '—'}</p>{item.publication_url && <p><a href={item.publication_url} target="_blank">Open WordPress item ↗</a></p>}<div className="button-row"><button className="secondary-button" disabled={item.status !== 'approved' || Boolean(busy)} onClick={() => publish(item.id,false)}>{busy === item.id ? 'Working…' : 'Create WordPress draft'}</button><button className="app-button" disabled={item.status !== 'approved' || Boolean(busy)} onClick={() => publish(item.id,true)}>Publish approved content</button></div></article>)}</div>
    <div className="button-row"><a className="secondary-button" href="/connections">WordPress setup</a><a className="secondary-button" href="/dashboard">Return to Luna</a></div>
  </section></main>;
}
