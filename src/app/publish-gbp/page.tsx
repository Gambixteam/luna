'use client';

import { useEffect, useState } from 'react';
import { authorizedFetch, getBrowserSupabase } from '@/lib/supabase/browser';

export default function PublishGbpPage() {
  const [posts, setPosts] = useState<Record<string, any>[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');

  async function load() {
    const supabase = await getBrowserSupabase();
    const session = await supabase.auth.getSession();
    if (!session.data.session?.user) return void (window.location.href = '/login');
    const membership = await supabase.from('organization_memberships').select('organization_id').eq('user_id', session.data.session.user.id).limit(1).maybeSingle();
    if (!membership.data) return void (window.location.href = '/dashboard');
    const rows = await supabase.from('content_items').select('*').eq('organization_id', membership.data.organization_id).eq('content_type', 'gbp_post').order('created_at', { ascending: false });
    setPosts(rows.data ?? []);
  }

  useEffect(() => { load().catch((error) => setMessage(error instanceof Error ? error.message : 'Unable to load posts.')); }, []);

  async function publish(contentId: string) {
    setBusy(contentId); setMessage('');
    try {
      const response = await authorizedFetch('/api/integrations/google/publish-post', { method: 'POST', body: JSON.stringify({ contentId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Publication failed.');
      setMessage('The approved post was published to Google Business Profile.'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Publication failed.'); }
    finally { setBusy(''); }
  }

  return <main className="google-setup-page"><section className="google-setup-card">
    <a className="app-brand" href="/dashboard"><span className="app-brand-mark">L</span><span>Luna <small>by Gambix</small></span></a>
    <div><span className="kicker">Google Business Profile</span><h1>Publish only approved posts.</h1><p>Luna separates drafting, approval and publication. Posts cannot reach Google until an authorized user approves them.</p></div>
    {message && <div className="notice">{message}</div>}
    <div className="card-list">{posts.map((post) => <article className="panel" key={post.id}><span className="kicker">{post.status}</span><h3>{post.title}</h3><pre className="draft-copy">{post.draft}</pre>{post.status === 'approved' && <button className="app-button" onClick={() => publish(post.id)} disabled={Boolean(busy)}>{busy === post.id ? 'Publishing…' : 'Publish to Google'}</button>}{post.publication_url && <p className="muted">Google resource: {post.publication_url}</p>}</article>)}{!posts.length && <p className="muted">Create a GBP post in Content, then approve it in Approvals.</p>}</div>
    <div className="button-row"><a className="secondary-button" href="/connect-google">Google setup</a><a className="secondary-button" href="/dashboard">Return to Luna</a></div>
  </section></main>;
}
