'use client';

import { useEffect, useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabase/browser';

export default function ReviewSettingsPage() {
  const [organizationId, setOrganizationId] = useState('');
  const [slug, setSlug] = useState('');
  const [form, setForm] = useState({ reviewRequestUrl: '', supportEmail: '', bookingUrl: '', meetingUrl: '' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const supabase = await getBrowserSupabase(); const session = await supabase.auth.getSession();
    if (!session.data.session?.user) return void (window.location.href = '/login');
    const membership = await supabase.from('organization_memberships').select('organization_id').eq('user_id', session.data.session.user.id).limit(1).maybeSingle();
    if (!membership.data) return void (window.location.href = '/dashboard');
    setOrganizationId(membership.data.organization_id);
    const [org, profile] = await Promise.all([supabase.from('organizations').select('slug').eq('id', membership.data.organization_id).single(), supabase.from('business_profiles').select('review_request_url,support_email,booking_url,meeting_url').eq('organization_id', membership.data.organization_id).single()]);
    setSlug(org.data?.slug ?? '');
    setForm({ reviewRequestUrl: profile.data?.review_request_url ?? '', supportEmail: profile.data?.support_email ?? session.data.session.user.email ?? '', bookingUrl: profile.data?.booking_url ?? '', meetingUrl: profile.data?.meeting_url ?? '' });
  }

  useEffect(() => { load().catch((error) => setMessage(error instanceof Error ? error.message : 'Review settings could not load.')); }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const supabase = await getBrowserSupabase();
      const updated = await supabase.from('business_profiles').update({ review_request_url: form.reviewRequestUrl || null, support_email: form.supportEmail || null, booking_url: form.bookingUrl || null, meeting_url: form.meetingUrl || null, updated_at: new Date().toISOString() }).eq('organization_id', organizationId);
      if (updated.error) throw updated.error;
      setMessage('Review request and client-service settings saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Settings update failed.'); }
    finally { setBusy(false); }
  }

  const publicUrl = slug ? `${window.location.origin}/review/${slug}` : '';
  return <main className="google-setup-page"><section className="google-setup-card">
    <a className="app-brand" href="/dashboard"><span className="app-brand-mark">L</span><span>Luna <small>Review settings</small></span></a>
    <div><span className="kicker">Policy-compliant review acquisition</span><h1>Configure the review request experience.</h1><p>Use the direct Google review form URL. Luna’s public page asks every customer for an honest review and provides a private support option without filtering by sentiment.</p></div>
    {message && <div className="notice">{message}</div>}
    <form className="stack-form" onSubmit={save}>
      <label>Google review form URL<input type="url" placeholder="https://g.page/r/.../review" value={form.reviewRequestUrl} onChange={(event) => setForm({ ...form, reviewRequestUrl: event.target.value })} /></label>
      <label>Private support email<input type="email" value={form.supportEmail} onChange={(event) => setForm({ ...form, supportEmail: event.target.value })} /></label>
      <label>Booking URL<input type="url" value={form.bookingUrl} onChange={(event) => setForm({ ...form, bookingUrl: event.target.value })} /></label>
      <label>Gambix meeting URL<input type="url" value={form.meetingUrl} onChange={(event) => setForm({ ...form, meetingUrl: event.target.value })} /></label>
      <button className="app-button" disabled={!organizationId || busy}>{busy ? 'Saving…' : 'Save settings'}</button>
    </form>
    {publicUrl && <article className="panel"><span className="kicker">Public review page</span><h3>{publicUrl}</h3><div className="button-row"><a className="app-button" href={`/review/${slug}`} target="_blank">Open review page</a><button className="secondary-button" onClick={() => navigator.clipboard.writeText(publicUrl)}>Copy URL</button></div></article>}
    <a className="secondary-button" href="/dashboard">Return to Luna</a>
  </section></main>;
}
