'use client';

import { useEffect, useState } from 'react';
import { authorizedFetch, getBrowserSupabase } from '@/lib/supabase/browser';

const checklistItems = ['business_profile_reviewed','website_confirmed','google_access_received','wordpress_access_received','ghl_access_received','brand_assets_received','claims_reviewed','baseline_audit_complete','kickoff_scheduled'];

export default function OnboardingOpsPage() {
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');

  async function load() {
    const supabase = await getBrowserSupabase();
    const session = await supabase.auth.getSession();
    if (!session.data.session?.user) return void (window.location.href = '/login');
    const response = await authorizedFetch('/api/admin/onboarding');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Unable to load onboarding operations.');
    setRows(payload.submissions ?? []);
  }

  useEffect(() => { load().catch((error) => setMessage(error instanceof Error ? error.message : 'Onboarding operations could not load.')); }, []);

  async function save(row: Record<string, any>, status: string, checklist: Record<string, boolean>) {
    setBusy(row.id); setMessage('');
    try {
      const response = await authorizedFetch('/api/admin/onboarding', { method: 'POST', body: JSON.stringify({ submissionId: row.id, status, checklist }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Onboarding update failed.');
      setMessage('Onboarding status and checklist saved.'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Onboarding update failed.'); }
    finally { setBusy(''); }
  }

  return <main className="admin-page"><header className="admin-hero"><div><a className="app-brand" href="/admin"><span className="app-brand-mark">L</span><span>Luna <small>Onboarding operations</small></span></a><span className="kicker">Service delivery readiness</span><h1>Verify every client before execution starts.</h1></div><a className="secondary-button" href="/admin">Portfolio admin</a></header>
    {message && <div className="notice">{message}</div>}
    <div className="card-list">{rows.map((row) => <OnboardingCard key={row.id} row={row} busy={busy === row.id} save={save} />)}{!rows.length && <section className="empty-state"><h2>No onboarding submissions</h2><p>New Founding 15 submissions will appear here.</p></section>}</div>
  </main>;
}

function OnboardingCard({ row, busy, save }: { row: Record<string, any>; busy: boolean; save: (row: Record<string, any>, status: string, checklist: Record<string, boolean>) => void }) {
  const [status, setStatus] = useState(row.status);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => Object.fromEntries(checklistItems.map((item) => [item, Boolean(row.internal_checklist?.[item])] )));
  const completed = Object.values(checklist).filter(Boolean).length;
  return <article className="panel"><span className="kicker">{row.organization?.plan_key?.replaceAll('_',' ') ?? 'Founding 15'} · {row.status}</span><h2>{row.profile?.business_name ?? row.organization?.name}</h2><p>{row.site?.domain ?? 'No website'} · {row.profile?.phone ?? 'No phone'}</p>
    <div className="detail-grid"><div><dt>Submitted</dt><dd>{new Date(row.created_at).toLocaleString()}</dd></div><div><dt>Missing access</dt><dd>{row.missingAccess?.length ? row.missingAccess.join(', ') : 'None'}</dd></div><div><dt>Primary services</dt><dd>{row.profile?.primary_services?.join(', ') || '—'}</dd></div><div><dt>Service areas</dt><dd>{row.profile?.service_areas?.join(', ') || '—'}</dd></div></div>
    <h3>Internal checklist — {completed}/{checklistItems.length}</h3><div className="checklist-grid">{checklistItems.map((item) => <label className="checkbox" key={item}><input type="checkbox" checked={checklist[item]} onChange={(event) => setChecklist({ ...checklist, [item]: event.target.checked })} /> {item.replaceAll('_',' ')}</label>)}</div>
    <div className="inline-form"><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="submitted">Submitted</option><option value="needs_access">Needs access</option><option value="reviewing">Reviewing</option><option value="complete">Complete</option></select></label><button className="app-button" disabled={busy} onClick={() => save(row, status, checklist)}>{busy ? 'Saving…' : 'Save onboarding'}</button></div>
  </article>;
}
