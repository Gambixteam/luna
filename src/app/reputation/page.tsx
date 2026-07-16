'use client';

import { useEffect, useState } from 'react';
import { authorizedFetch, getBrowserSupabase } from '@/lib/supabase/browser';

export default function ReputationPage() {
  const [siteId, setSiteId] = useState('');
  const [reviews, setReviews] = useState<Record<string, any>[]>([]);
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
    const rows = await supabase.from('reputation_reviews').select('*').eq('site_id', site.data.id).order('create_time', { ascending: false });
    setReviews(rows.data ?? []);
  }

  useEffect(() => { load().catch((error) => setMessage(error instanceof Error ? error.message : 'Unable to load reviews.')); }, []);

  async function action(path: string, body: Record<string, unknown>, label: string) {
    setBusy(label); setMessage('');
    try {
      const response = await authorizedFetch(path, { method: 'POST', body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `${label} failed.`);
      setMessage(`${label} completed.`); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : `${label} failed.`); }
    finally { setBusy(''); }
  }

  return <main className="google-setup-page"><section className="google-setup-card reputation-card">
    <a className="app-brand" href="/dashboard"><span className="app-brand-mark">L</span><span>Luna <small>by Gambix</small></span></a>
    <div><span className="kicker">Review and reputation support</span><h1>Turn feedback into trust without losing control.</h1><p>Sync Google reviews, draft compliant responses, approve them inside Luna, and publish only after human review.</p></div>
    <div className="button-row"><button className="app-button" disabled={!siteId || Boolean(busy)} onClick={() => action('/api/reputation/google/sync', { siteId }, 'Review sync')}>{busy === 'Review sync' ? 'Syncing…' : 'Sync Google reviews'}</button><a className="secondary-button" href="/dashboard">Return to Luna</a></div>
    {message && <div className="notice">{message}</div>}
    <div className="card-list">{reviews.map((review) => <article className="panel" key={review.id}>
      <span className="kicker">{String(review.star_rating ?? 'Unrated').replaceAll('_',' ')} · {review.reply_status}</span>
      <h3>{review.reviewer_name ?? 'Google reviewer'}</h3><p>{review.comment || 'No written comment.'}</p>
      {review.review_reply && <div className="review-reply"><strong>Draft reply</strong><p>{review.review_reply}</p></div>}
      <div className="button-row">
        {review.reply_status !== 'published' && <button className="secondary-button" disabled={Boolean(busy)} onClick={() => action('/api/reputation/google/draft-reply', { reviewId: review.id }, 'Reply draft')}>{busy === 'Reply draft' ? 'Drafting…' : review.review_reply ? 'Redraft reply' : 'Draft reply'}</button>}
        {review.reply_status === 'pending_review' && <a className="secondary-button" href="/dashboard">Approve in Luna</a>}
        {review.reply_status !== 'published' && review.review_reply && <button className="app-button" disabled={Boolean(busy)} onClick={() => action('/api/reputation/google/publish-reply', { reviewId: review.id }, 'Reply publication')}>{busy === 'Reply publication' ? 'Publishing…' : 'Publish approved reply'}</button>}
      </div>
    </article>)}{!reviews.length && <p className="muted">Connect and sync Google Business Profile to load reviews.</p>}</div>
  </section></main>;
}
