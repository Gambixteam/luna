'use client';

import { useEffect, useState } from 'react';
import { authorizedFetch, getBrowserSupabase } from '@/lib/supabase/browser';

export default function TechnicalAuditPage() {
  const [siteId, setSiteId] = useState('');
  const [runs, setRuns] = useState<Record<string, any>[]>([]);
  const [findings, setFindings] = useState<Record<string, any>[]>([]);
  const [busy, setBusy] = useState(false);
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
    const [runRows, findingRows] = await Promise.all([
      supabase.from('audit_runs').select('*').eq('site_id', site.data.id).eq('audit_type','technical').order('created_at',{ascending:false}).limit(10),
      supabase.from('audit_findings').select('*').eq('site_id', site.data.id).order('created_at',{ascending:false}).limit(250),
    ]);
    setRuns(runRows.data ?? []); setFindings(findingRows.data ?? []);
  }

  useEffect(() => { load().catch((error) => setMessage(error instanceof Error ? error.message : 'Audit could not load.')); }, []);

  async function runAudit() {
    setBusy(true); setMessage('');
    try {
      const response = await authorizedFetch('/api/audits/technical', { method:'POST', body:JSON.stringify({siteId,maxPages:20}) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Technical audit failed.');
      setMessage(`Technical audit completed with a score of ${payload.summary.score}/100.`); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Technical audit failed.'); }
    finally { setBusy(false); }
  }

  const latest = runs[0];
  return <main className="google-setup-page"><section className="google-setup-card">
    <a className="app-brand" href="/dashboard"><span className="app-brand-mark">L</span><span>Luna <small>Technical audit</small></span></a>
    <div><span className="kicker">Crawlability, speed and indexation</span><h1>Inspect the technical foundation, not just page copy.</h1><p>Luna reviews public pages, robots.txt, XML sitemaps, HTTPS, mobile performance, Core Web Vitals indicators, metadata, schema, internal links and conversion signals.</p></div>
    {message && <div className="notice">{message}</div>}
    <div className="button-row"><button className="app-button" disabled={!siteId||busy} onClick={runAudit}>{busy?'Running audit…':'Run enhanced audit'}</button><a className="secondary-button" href="/dashboard">Return to Luna</a></div>
    <section className="metric-row"><article className="metric"><span>Technical score</span><strong>{latest?.summary?.score ?? '—'}</strong><small>Evidence weighted</small></article><article className="metric"><span>Pages crawled</span><strong>{latest?.summary?.pagesCrawled ?? 0}</strong><small>Maximum 20</small></article><article className="metric"><span>Sitemap URLs</span><strong>{latest?.summary?.sitemapUrlCount ?? 0}</strong><small>{latest?.summary?.sitemapUrl ?? 'Not found'}</small></article><article className="metric"><span>Mobile performance</span><strong>{latest?.summary?.pageSpeed?.performanceScore ?? '—'}</strong><small>PageSpeed score</small></article></section>
    <section className="panel"><div className="table-wrap"><table><thead><tr><th>Severity</th><th>Finding</th><th>Category</th><th>Evidence</th></tr></thead><tbody>{findings.map((item)=><tr key={item.id}><td><span className={`severity ${item.severity}`}>{item.severity}</span></td><td><strong>{item.title}</strong><small>{item.description}</small></td><td>{item.category}</td><td><code>{JSON.stringify(item.evidence)}</code></td></tr>)}</tbody></table></div></section>
  </section></main>;
}
