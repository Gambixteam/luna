'use client';

import { useEffect, useState } from 'react';
import { authorizedFetch, getBrowserSupabase } from '@/lib/supabase/browser';

export default function PilotFeedbackPage() {
  const [siteId, setSiteId] = useState('');
  const [saved, setSaved] = useState<Record<string, any> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ satisfactionScore: 8, mostValuable: '', missingOrConfusing: '', likelihoodToContinue: 8, contentDemand: 'standard', needsCallTracking: false, needsCustomReporting: false, writtenConversionApproval: false, testimonialPermission: false, feedbackSessionCompleted: false });

  async function load() {
    const supabase = await getBrowserSupabase(); const session = await supabase.auth.getSession();
    if (!session.data.session?.user) return void (window.location.href = '/login');
    const membership = await supabase.from('organization_memberships').select('organization_id').eq('user_id', session.data.session.user.id).limit(1).maybeSingle();
    if (!membership.data) return void (window.location.href = '/dashboard');
    const site = await supabase.from('sites').select('id').eq('organization_id', membership.data.organization_id).limit(1).maybeSingle();
    if (!site.data) return;
    setSiteId(site.data.id);
    const feedback = await supabase.from('pilot_feedback').select('*').eq('organization_id', membership.data.organization_id).maybeSingle();
    setSaved(feedback.data ?? null);
    if (feedback.data) setForm((current) => ({ ...current, satisfactionScore: feedback.data.satisfaction_score, mostValuable: feedback.data.most_valuable ?? '', missingOrConfusing: feedback.data.missing_or_confusing ?? '', likelihoodToContinue: feedback.data.likelihood_to_continue ?? 8, writtenConversionApproval: feedback.data.written_conversion_approval, testimonialPermission: feedback.data.testimonial_permission, feedbackSessionCompleted: feedback.data.feedback_session_completed }));
  }

  useEffect(() => { load().catch((error) => setMessage(error instanceof Error ? error.message : 'Pilot feedback could not load.')); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const response = await authorizedFetch('/api/pilot/feedback', { method: 'POST', body: JSON.stringify({ siteId, ...form }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Feedback submission failed.');
      setMessage(`Feedback saved. Luna recommends ${String(payload.recommendedPlan).replaceAll('_',' ')}. ${payload.conversionAuthorized ? 'Written conversion approval was recorded.' : 'No paid conversion was authorized.'}`);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Feedback submission failed.'); }
    finally { setBusy(false); }
  }

  return <main className="google-setup-page"><section className="google-setup-card">
    <a className="app-brand" href="/dashboard"><span className="app-brand-mark">L</span><span>Luna <small>Founding 15 completion</small></span></a>
    <div><span className="kicker">Pilot feedback and paid conversion</span><h1>Close the pilot with evidence and explicit consent.</h1><p>Luna recommends Core, Plus or Scale from the operating scope. It never converts a pilot to a paid plan without written approval.</p></div>
    {message && <div className="notice">{message}</div>}
    {saved && <section className="metric-row"><article className="metric"><span>Recommended plan</span><strong>{String(saved.recommended_plan).replaceAll('_',' ')}</strong><small>Based on the recorded scope</small></article><article className="metric"><span>Satisfaction</span><strong>{saved.satisfaction_score}/10</strong><small>Pilot experience</small></article><article className="metric"><span>Continue likelihood</span><strong>{saved.likelihood_to_continue}/10</strong><small>Client-reported</small></article><article className="metric"><span>Paid conversion</span><strong>{saved.written_conversion_approval ? 'Approved' : 'Not approved'}</strong><small>Written consent only</small></article></section>}
    <form className="form-grid" onSubmit={submit}>
      <label>Satisfaction score<input type="number" min="1" max="10" value={form.satisfactionScore} onChange={(event) => setForm({ ...form, satisfactionScore: Number(event.target.value) })} /></label>
      <label>Likelihood to continue<input type="number" min="1" max="10" value={form.likelihoodToContinue} onChange={(event) => setForm({ ...form, likelihoodToContinue: Number(event.target.value) })} /></label>
      <label className="span-2">Most valuable part<textarea value={form.mostValuable} onChange={(event) => setForm({ ...form, mostValuable: event.target.value })} /></label>
      <label className="span-2">What was missing or confusing?<textarea value={form.missingOrConfusing} onChange={(event) => setForm({ ...form, missingOrConfusing: event.target.value })} /></label>
      <label>Expected content demand<select value={form.contentDemand} onChange={(event) => setForm({ ...form, contentDemand: event.target.value })}><option value="light">Light</option><option value="standard">Standard</option><option value="high">High</option></select></label>
      <label className="checkbox"><input type="checkbox" checked={form.needsCallTracking} onChange={(event) => setForm({ ...form, needsCallTracking: event.target.checked })} /> Call tracking is required</label>
      <label className="checkbox"><input type="checkbox" checked={form.needsCustomReporting} onChange={(event) => setForm({ ...form, needsCustomReporting: event.target.checked })} /> Custom executive reporting is required</label>
      <label className="checkbox"><input type="checkbox" checked={form.feedbackSessionCompleted} onChange={(event) => setForm({ ...form, feedbackSessionCompleted: event.target.checked })} /> Gambix feedback session completed</label>
      <label className="checkbox"><input type="checkbox" checked={form.testimonialPermission} onChange={(event) => setForm({ ...form, testimonialPermission: event.target.checked })} /> Gambix may request testimonial usage</label>
      <label className="checkbox span-2"><input type="checkbox" checked={form.writtenConversionApproval} onChange={(event) => setForm({ ...form, writtenConversionApproval: event.target.checked })} /> I provide written approval to proceed toward the recommended paid Luna plan. This does not replace the service agreement or Stripe checkout.</label>
      <button className="app-button span-2" disabled={!siteId || busy}>{busy ? 'Saving feedback…' : 'Save pilot feedback and recommendation'}</button>
    </form>
    <div className="button-row"><a className="secondary-button" href="/billing">Review plans</a><a className="secondary-button" href="/dashboard">Return to Luna</a></div>
  </section></main>;
}
