'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { authorizedFetch, getBrowserSupabase } from '@/lib/supabase/browser';

type Row = Record<string, any>;
type Tab = 'overview'|'onboarding'|'audit'|'keywords'|'strategy'|'content'|'local'|'analytics'|'tasks'|'approvals'|'reports'|'integrations';

const tabs: Array<{ key: Tab; label: string }> = [
  { key: 'overview', label: 'Overview' }, { key: 'onboarding', label: 'Business profile' },
  { key: 'audit', label: 'Website audit' }, { key: 'keywords', label: 'Keywords' },
  { key: 'strategy', label: 'Strategy' }, { key: 'content', label: 'Content' },
  { key: 'local', label: 'Local & citations' }, { key: 'analytics', label: 'Analytics' },
  { key: 'tasks', label: 'Action center' }, { key: 'approvals', label: 'Approvals' },
  { key: 'reports', label: 'Reports' }, { key: 'integrations', label: 'Integrations' },
];

const splitList = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);
const today = new Date().toISOString().slice(0, 10);
const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

async function lunaAction(action: string, body: Record<string, unknown>) {
  const response = await authorizedFetch(`/api/luna/${action}`, { method: 'POST', body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? 'Luna action failed.');
  return payload;
}

export function LunaApp() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [membership, setMembership] = useState<Row | null>(null);
  const [organization, setOrganization] = useState<Row | null>(null);
  const [profile, setProfile] = useState<Row | null>(null);
  const [sites, setSites] = useState<Row[]>([]);
  const [data, setData] = useState<Record<string, Row[]>>({});
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  const site = sites[0] ?? null;

  const load = useCallback(async (client: SupabaseClient, currentUser: User) => {
    setLoading(true);
    const member = await client.from('organization_memberships').select('*').eq('user_id', currentUser.id).limit(1).maybeSingle();
    setMembership(member.data ?? null);
    if (!member.data) { setOrganization(null); setProfile(null); setSites([]); setData({}); setLoading(false); return; }
    const orgId = member.data.organization_id;
    const [org, business, siteRows, audits, findings, keywords, strategies, content, citations, ranks, analytics, tasks, approvals, reports, integrations, recommendations, competitors] = await Promise.all([
      client.from('organizations').select('*').eq('id', orgId).single(),
      client.from('business_profiles').select('*').eq('organization_id', orgId).maybeSingle(),
      client.from('sites').select('*').eq('organization_id', orgId).order('created_at'),
      client.from('audit_runs').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(20),
      client.from('audit_findings').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(200),
      client.from('keyword_targets').select('*').eq('organization_id', orgId).order('priority', { ascending: false }).limit(200),
      client.from('strategies').select('*').eq('organization_id', orgId).order('version', { ascending: false }),
      client.from('content_items').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }),
      client.from('citations').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }),
      client.from('rank_snapshots').select('*,keyword_targets(keyword)').eq('organization_id', orgId).order('captured_on', { ascending: false }).limit(200),
      client.from('analytics_snapshots').select('*').eq('organization_id', orgId).order('period_end', { ascending: false }).limit(100),
      client.from('tasks').select('*').eq('organization_id', orgId).order('priority', { ascending: false }),
      client.from('approvals').select('*').eq('organization_id', orgId).order('requested_at', { ascending: false }),
      client.from('reports').select('*').eq('organization_id', orgId).order('period_end', { ascending: false }),
      client.from('integrations').select('*').eq('organization_id', orgId).order('provider'),
      client.from('recommendations').select('*').eq('organization_id', orgId).order('priority', { ascending: false }).limit(100),
      client.from('competitors').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }),
    ]);
    setOrganization(org.data ?? null); setProfile(business.data ?? null); setSites(siteRows.data ?? []);
    setData({ audits: audits.data ?? [], findings: findings.data ?? [], keywords: keywords.data ?? [], strategies: strategies.data ?? [], content: content.data ?? [], citations: citations.data ?? [], ranks: ranks.data ?? [], analytics: analytics.data ?? [], tasks: tasks.data ?? [], approvals: approvals.data ?? [], reports: reports.data ?? [], integrations: integrations.data ?? [], recommendations: recommendations.data ?? [], competitors: competitors.data ?? [] });
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    getBrowserSupabase().then(async (client) => {
      if (!active) return;
      setSupabase(client);
      const session = await client.auth.getSession();
      if (!session.data.session?.user) { window.location.href = '/login'; return; }
      setUser(session.data.session.user); await load(client, session.data.session.user);
      client.auth.onAuthStateChange((_event, next) => { if (!next?.user) window.location.href = '/login'; else setUser(next.user); });
    }).catch((error) => { setNotice(error instanceof Error ? error.message : 'Luna could not start.'); setLoading(false); });
    return () => { active = false; };
  }, [load]);

  async function run(label: string, action: string, body: Record<string, unknown>) {
    if (!supabase || !user) return;
    setBusy(label); setNotice('');
    try { await lunaAction(action, body); setNotice(`${label} completed.`); await load(supabase, user); }
    catch (error) { setNotice(error instanceof Error ? error.message : `${label} failed.`); }
    finally { setBusy(''); }
  }

  async function signOut() { if (supabase) await supabase.auth.signOut(); window.location.href = '/'; }

  if (loading) return <main className="app-loading"><div className="app-brand-mark">L</div><p>Loading Luna…</p></main>;
  if (!user) return null;

  return <main className="luna-app">
    <aside className="app-sidebar">
      <a className="app-brand" href="/"><span className="app-brand-mark">L</span><span>Luna <small>by Gambix</small></span></a>
      <nav>{tabs.map((item) => <button key={item.key} className={tab === item.key ? 'active' : ''} onClick={() => setTab(item.key)}>{item.label}</button>)}</nav>
      <div className="sidebar-bottom"><span>{organization?.name ?? 'New Luna account'}</span><small>{user.email}</small><button onClick={signOut}>Sign out</button></div>
    </aside>
    <section className="app-main">
      <header className="app-header"><div><span className="kicker">Luna operating system</span><h1>{tabs.find((item) => item.key === tab)?.label}</h1></div><span className="plan-chip">{String(organization?.plan_key ?? 'Founding 15').replaceAll('_', ' ')}</span></header>
      {notice && <div className="notice">{notice}</div>}
      {!membership ? <Onboarding busy={busy} onSubmit={(payload) => run('Onboarding', 'onboarding', payload)} /> : <>
        {tab === 'overview' && <Overview organization={organization} site={site} data={data} setTab={setTab} />}
        {tab === 'onboarding' && <BusinessProfile profile={profile} site={site} />}
        {tab === 'audit' && <Audit site={site} data={data} busy={busy} run={run} />}
        {tab === 'keywords' && <Keywords site={site} rows={data.keywords ?? []} busy={busy} run={run} />}
        {tab === 'strategy' && <Strategy site={site} rows={data.strategies ?? []} busy={busy} run={run} />}
        {tab === 'content' && <Content site={site} rows={data.content ?? []} busy={busy} run={run} />}
        {tab === 'local' && <Local site={site} citations={data.citations ?? []} competitors={data.competitors ?? []} busy={busy} run={run} />}
        {tab === 'analytics' && <Analytics site={site} snapshots={data.analytics ?? []} ranks={data.ranks ?? []} busy={busy} run={run} />}
        {tab === 'tasks' && <Tasks site={site} rows={data.tasks ?? []} busy={busy} run={run} />}
        {tab === 'approvals' && <Approvals rows={data.approvals ?? []} busy={busy} run={run} />}
        {tab === 'reports' && <Reports site={site} rows={data.reports ?? []} busy={busy} run={run} />}
        {tab === 'integrations' && <Integrations site={site} rows={data.integrations ?? []} busy={busy} run={run} />}
      </>}
    </section>
  </main>;
}

function Onboarding({ busy, onSubmit }: { busy: string; onSubmit: (payload: Record<string, unknown>) => void }) {
  const [form, setForm] = useState({ businessName: '', website: '', phone: '', primaryServices: '', serviceAreas: '', targetCustomers: '', brandVoice: '', competitors: '', goals: '', leadSources: '', agreementAcknowledged: false });
  return <section className="empty-state onboarding-card"><span className="kicker">Founding 15 onboarding</span><h2>Give Luna the facts it needs to build your growth system.</h2><p>This information becomes the evidence base for your audit, keyword map, strategy, content and reporting.</p><form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit({ ...form, primaryServices: splitList(form.primaryServices), serviceAreas: splitList(form.serviceAreas), competitors: splitList(form.competitors), leadSources: splitList(form.leadSources) }); }}>
    <label>Business name<input required value={form.businessName} onChange={(event) => setForm({ ...form, businessName: event.target.value })} /></label>
    <label>Website<input required placeholder="https://example.com" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} /></label>
    <label>Phone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
    <label>Primary services <small>Comma separated</small><input required value={form.primaryServices} onChange={(event) => setForm({ ...form, primaryServices: event.target.value })} /></label>
    <label>Service areas <small>Comma separated</small><input required value={form.serviceAreas} onChange={(event) => setForm({ ...form, serviceAreas: event.target.value })} /></label>
    <label>Lead sources <small>Comma separated</small><input value={form.leadSources} onChange={(event) => setForm({ ...form, leadSources: event.target.value })} /></label>
    <label className="span-2">Target customers<textarea value={form.targetCustomers} onChange={(event) => setForm({ ...form, targetCustomers: event.target.value })} /></label>
    <label className="span-2">Brand voice<textarea value={form.brandVoice} onChange={(event) => setForm({ ...form, brandVoice: event.target.value })} /></label>
    <label className="span-2">Known competitors <small>Comma separated</small><input value={form.competitors} onChange={(event) => setForm({ ...form, competitors: event.target.value })} /></label>
    <label className="span-2">Business goals<textarea value={form.goals} onChange={(event) => setForm({ ...form, goals: event.target.value })} /></label>
    <label className="checkbox span-2"><input type="checkbox" checked={form.agreementAcknowledged} onChange={(event) => setForm({ ...form, agreementAcknowledged: event.target.checked })} required /> I confirm Gambix may access the submitted data to provide Luna services.</label>
    <button className="app-button span-2" disabled={Boolean(busy)}>{busy || 'Complete onboarding'}</button>
  </form></section>;
}

function Overview({ organization, site, data, setTab }: { organization: Row|null; site: Row|null; data: Record<string, Row[]>; setTab: (tab: Tab) => void }) {
  const latestAudit = data.audits?.[0]; const openTasks = data.tasks?.filter((item) => !['completed','archived'].includes(item.status)).length ?? 0; const pending = data.approvals?.filter((item) => item.status === 'pending').length ?? 0; const completed = data.tasks?.filter((item) => item.status === 'completed').length ?? 0;
  return <><section className="metric-row"><Metric label="Website health" value={latestAudit?.summary?.score != null ? `${latestAudit.summary.score}/100` : 'Not audited'} detail={latestAudit ? `${latestAudit.summary.pagesCrawled ?? 0} pages reviewed` : 'Run your first audit'} /><Metric label="Open priorities" value={String(openTasks)} detail={`${completed} completed`} /><Metric label="Approvals" value={String(pending)} detail="Waiting for a decision" /><Metric label="Current plan" value={String(organization?.plan_key ?? 'founding_15').replaceAll('_',' ')} detail={organization?.account_status ?? 'pilot'} /></section>
    <section className="dashboard-grid"><article className="panel span-2"><div className="panel-head"><div><span className="kicker">Current priority</span><h2>{site ? `Build visibility for ${site.display_name ?? site.domain}` : 'Add your first website'}</h2></div><button className="app-button" onClick={() => setTab(latestAudit ? 'strategy' : 'audit')}>{latestAudit ? 'Build strategy' : 'Run audit'}</button></div><p>Luna turns verified business data into assigned, reviewable work. The system will not publish or change a client property without approval.</p><div className="progress-steps"><span className={site ? 'done' : ''}>Business profile</span><span className={latestAudit ? 'done' : ''}>Website audit</span><span className={data.keywords?.length ? 'done' : ''}>Keyword map</span><span className={data.strategies?.length ? 'done' : ''}>90-day strategy</span></div></article>
    <article className="panel"><span className="kicker">Recommendations</span><h3>Highest priority</h3><div className="list">{(data.recommendations ?? []).slice(0, 5).map((item) => <div className="list-row" key={item.id}><div><strong>{item.problem}</strong><small>{item.category} · priority {item.priority}</small></div></div>)}{!data.recommendations?.length && <p className="muted">Run an audit to generate evidence-backed recommendations.</p>}</div></article>
    <article className="panel"><span className="kicker">Work queue</span><h3>Upcoming actions</h3><div className="list">{(data.tasks ?? []).filter((item) => item.status !== 'completed').slice(0, 5).map((item) => <div className="list-row" key={item.id}><div><strong>{item.title}</strong><small>{item.status} · {item.category}</small></div></div>)}{!data.tasks?.length && <p className="muted">Luna will create tasks from audits and strategy.</p>}</div></article></section></>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <article className="metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
function BusinessProfile({ profile, site }: { profile: Row|null; site: Row|null }) { return <section className="dashboard-grid"><article className="panel span-2"><span className="kicker">Business evidence</span><h2>{profile?.business_name ?? 'Business profile'}</h2><dl className="detail-grid"><div><dt>Website</dt><dd>{site?.domain ?? '—'}</dd></div><div><dt>Phone</dt><dd>{profile?.phone ?? '—'}</dd></div><div><dt>Primary services</dt><dd>{profile?.primary_services?.join(', ') || '—'}</dd></div><div><dt>Service areas</dt><dd>{profile?.service_areas?.join(', ') || '—'}</dd></div><div><dt>Target customers</dt><dd>{profile?.target_customers || '—'}</dd></div><div><dt>Brand voice</dt><dd>{profile?.brand_voice || '—'}</dd></div><div><dt>Goals</dt><dd>{profile?.goals || '—'}</dd></div><div><dt>Competitors</dt><dd>{profile?.competitors?.join(', ') || '—'}</dd></div></dl></article><article className="panel"><h3>Approved claims</h3><p className="muted">{profile?.approved_claims?.join(', ') || 'No claims have been approved yet.'}</p></article><article className="panel"><h3>Restricted claims</h3><p className="muted">{profile?.restricted_claims?.join(', ') || 'No restricted claims recorded.'}</p></article></section>; }

function Audit({ site, data, busy, run }: any) { const latest = data.audits?.[0]; return <><div className="action-bar"><div><h2>Website and conversion audit</h2><p>Luna crawls up to 12 public pages and stores page-level evidence.</p></div><button className="app-button" disabled={!site || Boolean(busy)} onClick={() => run('Website audit','audit',{ siteId: site.id })}>{busy || 'Run new audit'}</button></div><section className="metric-row"><Metric label="Health score" value={latest?.summary?.score != null ? `${latest.summary.score}/100` : '—'} detail="Transparent issue-weighted score" /><Metric label="Pages crawled" value={String(latest?.summary?.pagesCrawled ?? 0)} detail={latest?.status ?? 'No audit'} /><Metric label="Critical issues" value={String(latest?.summary?.critical ?? 0)} detail="Requires immediate review" /><Metric label="High issues" value={String(latest?.summary?.high ?? 0)} detail="Material opportunity" /></section><section className="panel"><span className="kicker">Findings</span><h2>Technical, content, local and conversion gaps</h2><div className="table-wrap"><table><thead><tr><th>Severity</th><th>Finding</th><th>Category</th><th>Status</th></tr></thead><tbody>{(data.findings ?? []).map((item: Row) => <tr key={item.id}><td><span className={`severity ${item.severity}`}>{item.severity}</span></td><td><strong>{item.title}</strong><small>{item.description}</small></td><td>{item.category}</td><td>{item.status}</td></tr>)}</tbody></table></div>{!data.findings?.length && <p className="muted">No findings yet. Run the first audit.</p>}</section></>; }
function Keywords({ site, rows, busy, run }: any) { return <><div className="action-bar"><div><h2>Service and local keyword map</h2><p>Prioritized by commercial, local, urgent and informational intent.</p></div><button className="app-button" disabled={!site || Boolean(busy)} onClick={() => run('Keyword research','keywords',{ siteId: site.id })}>{busy || 'Generate keyword map'}</button></div><section className="panel"><div className="table-wrap"><table><thead><tr><th>Keyword</th><th>Service</th><th>Location</th><th>Intent</th><th>Priority</th></tr></thead><tbody>{rows.map((item: Row) => <tr key={item.id}><td><strong>{item.keyword}</strong></td><td>{item.service}</td><td>{item.location}</td><td>{item.intent}</td><td>{item.priority}</td></tr>)}</tbody></table></div>{!rows.length && <p className="muted">Generate research after completing onboarding.</p>}</section></>; }
function Strategy({ site, rows, busy, run }: any) { const strategy = rows[0]; return <><div className="action-bar"><div><h2>30, 60 and 90-day growth strategy</h2><p>Built from the business profile, audit evidence, keywords, competitors and analytics.</p></div><button className="app-button" disabled={!site || Boolean(busy)} onClick={() => run('Strategy generation','strategy',{ siteId: site.id })}>{busy || (strategy ? 'Create new version' : 'Generate strategy')}</button></div>{strategy ? <section className="panel strategy-document"><span className="kicker">Version {strategy.version} · {strategy.status}</span><h2>{strategy.title}</h2><JsonDocument value={strategy.content} /></section> : <section className="empty-state"><h2>No strategy yet</h2><p>Run the audit and keyword map first, then generate a reviewable strategy.</p></section>}</>; }

function Content({ site, rows, busy, run }: any) { const [form, setForm] = useState({ contentType: 'service_page', title: '', targetKeyword: '', audience: 'Local service customers' }); return <><section className="panel"><span className="kicker">Content studio</span><h2>Create a grounded brief and draft</h2><form className="form-grid" onSubmit={(event) => { event.preventDefault(); run('Content draft','content',{ ...form, siteId: site.id }); }}><label>Content type<select value={form.contentType} onChange={(event) => setForm({...form,contentType:event.target.value})}><option value="service_page">Service page</option><option value="location_page">Location page</option><option value="blog">Blog article</option><option value="comparison">Comparison page</option><option value="buyer_guide">Buyer guide</option><option value="emergency_page">Emergency page</option><option value="gbp_post">GBP post</option><option value="page_refresh">Existing page refresh</option></select></label><label>Title<input required value={form.title} onChange={(event) => setForm({...form,title:event.target.value})} /></label><label>Target keyword<input required value={form.targetKeyword} onChange={(event) => setForm({...form,targetKeyword:event.target.value})} /></label><label>Audience<input value={form.audience} onChange={(event) => setForm({...form,audience:event.target.value})} /></label><button className="app-button span-2" disabled={!site || Boolean(busy)}>{busy || 'Generate brief and draft'}</button></form></section><section className="card-list">{rows.map((item: Row) => <article className="panel" key={item.id}><span className="kicker">{item.content_type} · {item.status}</span><h3>{item.title}</h3><p><strong>Target:</strong> {item.target_keyword}</p><details><summary>View brief</summary><JsonDocument value={item.brief} /></details><details><summary>View draft</summary><pre className="draft-copy">{item.draft}</pre></details></article>)}</section></>; }
function Local({ site, citations, competitors, busy, run }: any) { const [directoryName,setDirectoryName]=useState('Google Business Profile'); const [listingUrl,setListingUrl]=useState(''); const [status,setStatus]=useState('missing'); return <section className="dashboard-grid"><article className="panel"><span className="kicker">Citation tracker</span><h2>Add or review a listing</h2><form className="stack-form" onSubmit={(event)=>{event.preventDefault();run('Citation update','citation',{siteId:site.id,directoryName,listingUrl,status});}}><label>Directory<input value={directoryName} onChange={(event)=>setDirectoryName(event.target.value)} /></label><label>Listing URL<input value={listingUrl} onChange={(event)=>setListingUrl(event.target.value)} /></label><label>Status<select value={status} onChange={(event)=>setStatus(event.target.value)}><option>missing</option><option>incorrect</option><option>duplicate</option><option>submitted</option><option>live</option><option>verified</option></select></label><button className="app-button" disabled={!site||Boolean(busy)}>{busy||'Save citation'}</button></form></article><article className="panel"><span className="kicker">Local competitor snapshot</span><h2>{competitors.length} competitors tracked</h2><div className="list">{competitors.map((item:Row)=><div className="list-row" key={item.id}><div><strong>{item.name}</strong><small>{item.domain||item.gbp_url||'Client submitted'}</small></div></div>)}{!competitors.length&&<p className="muted">Competitors submitted during onboarding feed the strategy workflow.</p>}</div></article><article className="panel span-2"><h2>Citation status</h2><div className="table-wrap"><table><thead><tr><th>Directory</th><th>Status</th><th>NAP</th><th>URL</th></tr></thead><tbody>{citations.map((item:Row)=><tr key={item.id}><td>{item.directory_name}</td><td>{item.status}</td><td>{item.nap_consistent==null?'Not reviewed':item.nap_consistent?'Consistent':'Needs correction'}</td><td>{item.listing_url?<a href={item.listing_url} target="_blank">Open ↗</a>:'—'}</td></tr>)}</tbody></table></div></article></section>; }
function Analytics({ site, snapshots, ranks, busy, run }: any) { const [source,setSource]=useState('gsc'); const [periodStart,setPeriodStart]=useState(monthStart); const [periodEnd,setPeriodEnd]=useState(today); const [metrics,setMetrics]=useState('{"clicks":0,"impressions":0,"conversions":0}'); return <><section className="panel"><span className="kicker">Verified data import</span><h2>Add a normalized analytics snapshot</h2><p className="muted">OAuth connectors appear in Integrations. This supports immediate exported-data entry while access is being approved.</p><form className="form-grid" onSubmit={(event)=>{event.preventDefault();run('Analytics import','analytics',{siteId:site.id,source,periodStart,periodEnd,metrics:JSON.parse(metrics),dimensions:{}});}}><label>Source<select value={source} onChange={(event)=>setSource(event.target.value)}><option value="gsc">Search Console</option><option value="ga4">GA4</option><option value="gbp">Google Business Profile</option><option value="ghl">GoHighLevel</option><option value="forms">Forms</option><option value="calls">Calls</option><option value="bookings">Bookings</option></select></label><label>Period start<input type="date" value={periodStart} onChange={(event)=>setPeriodStart(event.target.value)} /></label><label>Period end<input type="date" value={periodEnd} onChange={(event)=>setPeriodEnd(event.target.value)} /></label><label className="span-2">Metrics JSON<textarea value={metrics} onChange={(event)=>setMetrics(event.target.value)} /></label><button className="app-button span-2" disabled={!site||Boolean(busy)}>{busy||'Save verified snapshot'}</button></form></section><section className="dashboard-grid"><article className="panel span-2"><h2>Analytics history</h2><div className="table-wrap"><table><thead><tr><th>Source</th><th>Period</th><th>Metrics</th></tr></thead><tbody>{snapshots.map((item:Row)=><tr key={item.id}><td>{item.source}</td><td>{item.period_start} → {item.period_end}</td><td><code>{JSON.stringify(item.metrics)}</code></td></tr>)}</tbody></table></div></article><article className="panel span-2"><h2>Rank history</h2><div className="table-wrap"><table><thead><tr><th>Keyword</th><th>Location</th><th>Organic</th><th>Map pack</th><th>Date</th></tr></thead><tbody>{ranks.map((item:Row)=><tr key={item.id}><td>{item.keyword_targets?.keyword||'—'}</td><td>{item.location||'—'}</td><td>{item.organic_position??'—'}</td><td>{item.map_pack_position??'—'}</td><td>{item.captured_on}</td></tr>)}</tbody></table></div></article></section></>; }
function Tasks({ site, rows, busy, run }: any) { const [title,setTitle]=useState(''); const [category,setCategory]=useState('technical'); return <><section className="panel"><span className="kicker">Action center</span><h2>Assigned and measurable execution</h2><form className="inline-form" onSubmit={(event)=>{event.preventDefault();run('Task creation','task',{siteId:site?.id,title,category,priority:50,status:'draft'});setTitle('');}}><input required placeholder="New action" value={title} onChange={(event)=>setTitle(event.target.value)} /><select value={category} onChange={(event)=>setCategory(event.target.value)}><option>technical</option><option>on-page</option><option>content</option><option>local SEO</option><option>Google Business Profile</option><option>citation</option><option>reporting</option><option>analytics</option><option>review management</option><option>conversion optimization</option></select><button className="app-button" disabled={Boolean(busy)}>{busy||'Add task'}</button></form></section><section className="panel"><div className="table-wrap"><table><thead><tr><th>Priority</th><th>Task</th><th>Category</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map((item:Row)=><tr key={item.id}><td>{item.priority}</td><td><strong>{item.title}</strong><small>{item.impact}</small></td><td>{item.category}</td><td>{item.status}</td><td>{item.status!=='completed'&&<button className="table-button" onClick={()=>run('Task completion','task',{id:item.id,status:'completed',notes:'Completed in Luna.'})}>Mark complete</button>}</td></tr>)}</tbody></table></div></section></>; }
function Approvals({ rows, busy, run }: any) { return <section className="card-list">{rows.map((item:Row)=><article className="panel" key={item.id}><span className="kicker">{item.approval_type} · {item.status}</span><h3>{item.title}</h3><p>{item.summary}</p>{item.status==='pending'&&<div className="button-row"><button className="app-button" disabled={Boolean(busy)} onClick={()=>run('Approval','approval',{id:item.id,decision:'approved'})}>Approve</button><button className="secondary-button" disabled={Boolean(busy)} onClick={()=>run('Revision request','approval',{id:item.id,decision:'revision_requested',reason:'Please revise and resubmit.'})}>Request revision</button><button className="danger-button" disabled={Boolean(busy)} onClick={()=>run('Rejection','approval',{id:item.id,decision:'rejected',reason:'Not approved.'})}>Reject</button></div>}<details><summary>Review proposed content</summary><JsonDocument value={item.proposed_state} /></details></article>)}{!rows.length&&<section className="empty-state"><h2>No approvals waiting</h2><p>Strategies, content and reports will appear here before publication or delivery.</p></section>}</section>; }
function Reports({ site, rows, busy, run }: any) { const [start,setStart]=useState(monthStart); const [end,setEnd]=useState(today); return <><section className="panel"><span className="kicker">Monthly reporting</span><h2>Generate an evidence-backed client report</h2><form className="inline-form" onSubmit={(event)=>{event.preventDefault();run('Report generation','report',{siteId:site.id,periodStart:start,periodEnd:end});}}><input type="date" value={start} onChange={(event)=>setStart(event.target.value)} /><input type="date" value={end} onChange={(event)=>setEnd(event.target.value)} /><button className="app-button" disabled={!site||Boolean(busy)}>{busy||'Generate report'}</button></form></section><section className="card-list">{rows.map((item:Row)=><article className="panel report-card" key={item.id}><span className="kicker">{item.report_type} · {item.status}</span><h3>{item.period_start} to {item.period_end}</h3><p>{item.executive_summary}</p><details><summary>View full report</summary><JsonDocument value={item.sections} /></details><button className="secondary-button" onClick={()=>window.print()}>Print / Save as PDF</button></article>)}</section></>; }
function Integrations({ site, rows, busy, run }: any) { const labels:Record<string,string>={google_search_console:'Google Search Console',google_analytics_4:'Google Analytics 4',google_business_profile:'Google Business Profile',wordpress:'WordPress / Elementor',gohighlevel:'GoHighLevel',google_drive:'Google Drive',clickup:'ClickUp'}; return <section className="integration-grid">{rows.map((item:Row)=><article className="panel integration-card" key={item.id}><div className="integration-icon">{(labels[item.provider]||item.provider).slice(0,1)}</div><h3>{labels[item.provider]||item.provider}</h3><span className={`connection-status ${item.status}`}>{item.status.replaceAll('_',' ')}</span><p>{item.status==='connected'?'Data is available to Luna.':'Request access or connect credentials through Gambix.'}</p><button className="secondary-button" disabled={!site||Boolean(busy)} onClick={()=>run('Integration request','integration',{siteId:site.id,provider:item.provider,status:'needs_attention'})}>{item.status==='connected'?'Review connection':'Request connection'}</button></article>)}</section>; }
function JsonDocument({ value }: { value: unknown }) { if (value == null) return <p className="muted">No content.</p>; if (Array.isArray(value)) return <ul className="document-list">{value.map((item,index)=><li key={index}>{typeof item==='object'?<JsonDocument value={item}/>:String(item)}</li>)}</ul>; if (typeof value === 'object') return <div className="document-grid">{Object.entries(value as Record<string,unknown>).map(([key,item])=><section key={key}><h4>{key.replace(/([A-Z])/g,' $1').replaceAll('_',' ')}</h4><JsonDocument value={item}/></section>)}</div>; return <p>{String(value)}</p>; }
