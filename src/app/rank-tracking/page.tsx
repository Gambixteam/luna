'use client';

import { useEffect, useMemo, useState } from 'react';
import { authorizedFetch, getBrowserSupabase } from '@/lib/supabase/browser';

type RankRow = Record<string, any>;

export default function RankTrackingPage() {
  const [siteId, setSiteId] = useState('');
  const [rows, setRows] = useState<RankRow[]>([]);
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
    const result = await supabase.from('rank_snapshots').select('*,keyword_targets(keyword,service,location,intent)').eq('site_id', site.data.id).order('captured_on', { ascending: false }).limit(1000);
    setRows(result.data ?? []);
  }

  useEffect(() => { load().catch((error) => setMessage(error instanceof Error ? error.message : 'Rank history could not load.')); }, []);

  async function sync() {
    setBusy(true); setMessage('');
    try {
      const response = await authorizedFetch('/api/rank-tracking/sync', { method: 'POST', body: JSON.stringify({ siteId, limit: 150 }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Rank synchronization failed.');
      setMessage(`Saved ${payload.count} verified Search Console rank snapshots for ${payload.capturedOn}.`);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Rank synchronization failed.'); }
    finally { setBusy(false); }
  }

  const latestDate = rows[0]?.captured_on;
  const latest = rows.filter((row) => row.captured_on === latestDate);
  const topTen = latest.filter((row) => Number(row.organic_position) <= 10).length;
  const average = latest.length ? latest.reduce((total, row) => total + Number(row.organic_position ?? 0), 0) / latest.length : null;
  const histories = useMemo(() => {
    const byKeyword = new Map<string, RankRow[]>();
    for (const row of rows) {
      const key = row.keyword_id;
      const list = byKeyword.get(key) ?? [];
      list.push(row); byKeyword.set(key, list);
    }
    return [...byKeyword.values()].map((history) => {
      const sorted = history.sort((a, b) => String(b.captured_on).localeCompare(String(a.captured_on)));
      const current = sorted[0]; const previous = sorted[1];
      return { ...current, change: previous?.organic_position && current?.organic_position ? Number(previous.organic_position) - Number(current.organic_position) : null, previous: previous?.organic_position ?? null };
    }).sort((a, b) => Number(a.organic_position ?? 999) - Number(b.organic_position ?? 999));
  }, [rows]);

  return <main className="google-setup-page"><section className="google-setup-card">
    <a className="app-brand" href="/dashboard"><span className="app-brand-mark">L</span><span>Luna <small>Rank tracking</small></span></a>
    <div><span className="kicker">Verified Search Console visibility</span><h1>Track priority queries without manufacturing rank data.</h1><p>Luna converts the latest final Search Console query positions into monthly snapshots and identifies movement when prior periods exist.</p></div>
    {message && <div className="notice">{message}</div>}
    <div className="button-row"><button className="app-button" disabled={!siteId || busy} onClick={sync}>{busy ? 'Creating snapshots…' : 'Sync ranks from Search Console'}</button><a className="secondary-button" href="/connect-google">Sync Google first</a><a className="secondary-button" href="/dashboard">Return to Luna</a></div>
    <section className="metric-row"><article className="metric"><span>Tracked queries</span><strong>{latest.length}</strong><small>{latestDate ?? 'No snapshot'}</small></article><article className="metric"><span>Top 10</span><strong>{topTen}</strong><small>Verified organic positions</small></article><article className="metric"><span>Average position</span><strong>{average ? average.toFixed(1) : '—'}</strong><small>Latest tracked set</small></article><article className="metric"><span>Movement data</span><strong>{histories.filter((row) => row.change !== null).length}</strong><small>Queries with a prior period</small></article></section>
    <section className="panel"><div className="table-wrap"><table><thead><tr><th>Keyword</th><th>Location</th><th>Current</th><th>Previous</th><th>Movement</th><th>Ranking page</th><th>Date</th></tr></thead><tbody>{histories.map((row) => <tr key={row.id}><td><strong>{row.keyword_targets?.keyword ?? 'Unknown query'}</strong><small>{row.keyword_targets?.intent ?? ''}</small></td><td>{row.location || row.keyword_targets?.location || '—'}</td><td>{row.organic_position ? Number(row.organic_position).toFixed(1) : '—'}</td><td>{row.previous ? Number(row.previous).toFixed(1) : '—'}</td><td>{row.change === null ? '—' : row.change > 0 ? `↑ ${row.change.toFixed(1)}` : row.change < 0 ? `↓ ${Math.abs(row.change).toFixed(1)}` : 'No change'}</td><td>{row.ranking_url ? <a href={row.ranking_url} target="_blank">Open ↗</a> : '—'}</td><td>{row.captured_on}</td></tr>)}</tbody></table></div>{!histories.length && <p className="muted">Connect and sync Search Console, then create the first rank snapshot.</p>}</section>
  </section></main>;
}
