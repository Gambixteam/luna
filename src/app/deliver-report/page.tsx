'use client';

import { useEffect, useState } from 'react';
import { authorizedFetch, getBrowserSupabase } from '@/lib/supabase/browser';

export default function DeliverReportPage() {
  const [reports, setReports] = useState<Record<string, any>[]>([]);
  const [recipient, setRecipient] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    const supabase = await getBrowserSupabase(); const session = await supabase.auth.getSession();
    if (!session.data.session?.user) return void (window.location.href = '/login');
    setRecipient(session.data.session.user.email ?? '');
    const membership = await supabase.from('organization_memberships').select('organization_id').eq('user_id', session.data.session.user.id).limit(1).maybeSingle();
    if (!membership.data) return void (window.location.href = '/dashboard');
    const rows = await supabase.from('reports').select('*').eq('organization_id', membership.data.organization_id).order('period_end', { ascending: false });
    setReports(rows.data ?? []);
  }
  useEffect(() => { load().catch((error) => setMessage(error instanceof Error ? error.message : 'Reports could not load.')); }, []);

  async function deliver(reportId: string) {
    setBusy(reportId); setMessage('');
    try { const response = await authorizedFetch('/api/reports/deliver', { method: 'POST', body: JSON.stringify({ reportId, recipient }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? 'Delivery failed.'); setMessage('The approved report was delivered.'); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Delivery failed.'); }
    finally { setBusy(''); }
  }

  return <main className="google-setup-page"><section className="google-setup-card">
    <a className="app-brand" href="/dashboard"><span className="app-brand-mark">L</span><span>Luna <small>Report delivery</small></span></a>
    <div><span className="kicker">Approved client communication</span><h1>Deliver reports only after internal review.</h1><p>Luna records the recipient, provider message ID, delivery status and delivery time.</p></div>
    <label className="stack-form">Recipient email<input type="email" value={recipient} onChange={(event) => setRecipient(event.target.value)} /></label>
    {message && <div className="notice">{message}</div>}
    <div className="card-list">{reports.map((report) => <article className="panel" key={report.id}><span className="kicker">{report.status}</span><h3>{report.period_start} to {report.period_end}</h3><p>{report.executive_summary}</p><button className="app-button" disabled={report.status !== 'approved' || Boolean(busy) || !recipient} onClick={() => deliver(report.id)}>{busy === report.id ? 'Sending…' : report.status === 'approved' ? 'Email approved report' : 'Approval required'}</button></article>)}</div>
    <a className="secondary-button" href="/dashboard">Return to Luna</a>
  </section></main>;
}
