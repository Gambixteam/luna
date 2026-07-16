'use client';

import { useEffect, useState } from 'react';
import { authorizedFetch, getBrowserSupabase } from '@/lib/supabase/browser';

type Client = Record<string, any>;

export default function AdminPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    const supabase = await getBrowserSupabase();
    const session = await supabase.auth.getSession();
    if (!session.data.session?.user) return void (window.location.href = '/login');
    const response = await authorizedFetch('/api/admin/portfolio');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Unable to load Gambix admin.');
    setClients(payload.organizations ?? []); setLoading(false);
  }

  useEffect(() => { load().catch((error) => { setMessage(error instanceof Error ? error.message : 'Admin access failed.'); setLoading(false); }); }, []);

  async function update(client: Client, changes: Record<string, unknown>) {
    setMessage('Saving…');
    try {
      const response = await authorizedFetch('/api/admin/portfolio', { method: 'POST', body: JSON.stringify({ organizationId: client.id, ...changes }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? 'Update failed.');
      setMessage('Client updated.'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Update failed.'); }
  }

  if (loading) return <main className="app-loading"><div className="app-brand-mark">L</div><p>Loading Gambix portfolio…</p></main>;
  return <main className="admin-page"><header className="admin-hero"><div><a className="app-brand" href="/dashboard"><span className="app-brand-mark">L</span><span>Luna <small>Gambix administration</small></span></a><span className="kicker">Portfolio command center</span><h1>Manage every Luna client from one place.</h1></div><a className="secondary-button" href="/dashboard">Client dashboard</a></header>
    {message && <div className="notice">{message}</div>}
    <section className="metric-row"><article className="metric"><span>Clients</span><strong>{clients.length}</strong><small>All Luna accounts</small></article><article className="metric"><span>At risk</span><strong>{clients.filter((item) => item.clientHealth !== 'healthy').length}</strong><small>Needs attention</small></article><article className="metric"><span>Approvals</span><strong>{clients.reduce((total,item)=>total+item.pendingApprovals,0)}</strong><small>Waiting for review</small></article><article className="metric"><span>Overdue tasks</span><strong>{clients.reduce((total,item)=>total+item.overdueTasks,0)}</strong><small>Past due</small></article></section>
    <section className="panel"><div className="table-wrap"><table><thead><tr><th>Client</th><th>Plan</th><th>Onboarding</th><th>Missing access</th><th>Work</th><th>Health</th><th>Renewal</th></tr></thead><tbody>{clients.map((client) => <tr key={client.id}><td><strong>{client.businessProfile?.business_name ?? client.name}</strong><small>{client.sites?.[0]?.domain ?? 'No site'}</small></td><td><select value={client.plan_key ?? 'founding_15'} onChange={(event)=>update(client,{planKey:event.target.value})}><option value="founding_15">Founding 15</option><option value="luna_core">Core</option><option value="luna_plus">Plus</option><option value="luna_scale">Scale</option></select></td><td>{client.onboardingStatus}</td><td>{client.missingAccess.length ? client.missingAccess.length : 'Complete'}<small>{client.missingAccess.slice(0,2).join(', ')}</small></td><td>{client.tasksDue} open<small>{client.pendingApprovals} approvals · {client.reportsDue} reports</small></td><td><select value={client.account_status} onChange={(event)=>update(client,{accountStatus:event.target.value})}><option value="pilot">pilot</option><option value="active">active</option><option value="paused">paused</option><option value="blocked">blocked</option></select><small>{client.clientHealth}</small></td><td><input type="date" value={client.renewal_date ?? ''} onChange={(event)=>update(client,{renewalDate:event.target.value||null})} /></td></tr>)}</tbody></table></div>{!clients.length && <p className="muted">No Luna organizations have completed signup yet.</p>}</section>
  </main>;
}
