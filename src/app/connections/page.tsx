'use client';

import { useEffect, useState } from 'react';
import { authorizedFetch, getBrowserSupabase } from '@/lib/supabase/browser';

export default function ConnectionsPage() {
  const [context, setContext] = useState<{ organizationId: string; siteId: string } | null>(null);
  const [files, setFiles] = useState<Record<string, any>[]>([]);
  const [wordpress, setWordpress] = useState({ wordpressUrl: '', username: '', applicationPassword: '' });
  const [ghl, setGhl] = useState({ locationId: '', privateIntegrationToken: '' });
  const [ghlSetup, setGhlSetup] = useState<Record<string, string> | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');

  async function load() {
    const supabase = await getBrowserSupabase(); const session = await supabase.auth.getSession();
    if (!session.data.session?.user) return void (window.location.href = '/login');
    const membership = await supabase.from('organization_memberships').select('organization_id').eq('user_id', session.data.session.user.id).limit(1).maybeSingle();
    if (!membership.data) return void (window.location.href = '/dashboard');
    const site = await supabase.from('sites').select('id,domain').eq('organization_id', membership.data.organization_id).limit(1).maybeSingle();
    if (!site.data) return;
    setContext({ organizationId: membership.data.organization_id, siteId: site.data.id });
    setWordpress((value) => ({ ...value, wordpressUrl: site.data.domain }));
    const fileRows = await supabase.from('files').select('*').eq('organization_id', membership.data.organization_id).order('created_at', { ascending: false });
    setFiles(fileRows.data ?? []);
  }

  useEffect(() => { load().catch((error) => setMessage(error instanceof Error ? error.message : 'Unable to load connections.')); }, []);

  async function connect(path: string, body: Record<string, unknown>, label: string) {
    setBusy(label); setMessage('');
    try { const response = await authorizedFetch(path, { method: 'POST', body: JSON.stringify(body) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? `${label} failed.`); if (payload.webhookUrl) setGhlSetup({ webhookUrl: payload.webhookUrl, webhookSecret: payload.webhookSecret }); setMessage(`${label} connected.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : `${label} failed.`); }
    finally { setBusy(''); }
  }

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file || !context) return;
    setBusy('upload'); setMessage('');
    try {
      const supabase = await getBrowserSupabase();
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-'); const path = `${context.organizationId}/${crypto.randomUUID()}-${safe}`;
      const stored = await supabase.storage.from('luna-client-files').upload(path, file, { contentType: file.type, upsert: false });
      if (stored.error) throw stored.error;
      const row = await supabase.from('files').insert({ organization_id: context.organizationId, uploaded_by: (await supabase.auth.getUser()).data.user?.id, name: file.name, storage_path: path, mime_type: file.type, size_bytes: file.size });
      if (row.error) throw row.error; setMessage('File uploaded securely.'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Upload failed.'); }
    finally { setBusy(''); event.target.value = ''; }
  }

  return <main className="google-setup-page"><section className="google-setup-card">
    <a className="app-brand" href="/dashboard"><span className="app-brand-mark">L</span><span>Luna <small>Connections</small></span></a>
    <div><span className="kicker">Service delivery setup</span><h1>Connect the systems Gambix uses to execute.</h1><p>Credentials are encrypted server-side and never returned to the browser after submission.</p></div>
    {message && <div className="notice">{message}</div>}
    <div className="dashboard-grid">
      <article className="panel"><h2>WordPress / Elementor</h2><form className="stack-form" onSubmit={(event) => { event.preventDefault(); connect('/api/integrations/wordpress/connect', { siteId: context?.siteId, ...wordpress }, 'WordPress'); }}><label>WordPress URL<input value={wordpress.wordpressUrl} onChange={(event) => setWordpress({ ...wordpress, wordpressUrl: event.target.value })} /></label><label>Username<input value={wordpress.username} onChange={(event) => setWordpress({ ...wordpress, username: event.target.value })} /></label><label>Application password<input type="password" value={wordpress.applicationPassword} onChange={(event) => setWordpress({ ...wordpress, applicationPassword: event.target.value })} /></label><button className="app-button" disabled={!context || Boolean(busy)}>{busy === 'WordPress' ? 'Connecting…' : 'Connect WordPress'}</button></form></article>
      <article className="panel"><h2>GoHighLevel</h2><form className="stack-form" onSubmit={(event) => { event.preventDefault(); connect('/api/integrations/ghl/connect', { siteId: context?.siteId, ...ghl }, 'GoHighLevel'); }}><label>Location ID<input value={ghl.locationId} onChange={(event) => setGhl({ ...ghl, locationId: event.target.value })} /></label><label>Private integration token<input type="password" value={ghl.privateIntegrationToken} onChange={(event) => setGhl({ ...ghl, privateIntegrationToken: event.target.value })} /></label><button className="app-button" disabled={!context || Boolean(busy)}>{busy === 'GoHighLevel' ? 'Connecting…' : 'Connect GoHighLevel'}</button></form>{ghlSetup && <div className="webhook-box"><strong>Configure this custom webhook in HighLevel</strong><code>{ghlSetup.webhookUrl}</code><small>Header: x-luna-webhook-secret</small><code>{ghlSetup.webhookSecret}</code><small>Copy this now. Luna will not display it again.</small></div>}</article>
      <article className="panel span-2"><h2>Client document vault</h2><p className="muted">Upload access documents, brand assets, reports and approved source material. Maximum file size: 20 MB.</p><label className="secondary-button upload-button">{busy === 'upload' ? 'Uploading…' : 'Choose file'}<input type="file" onChange={upload} disabled={!context || Boolean(busy)} /></label><div className="list">{files.map((file) => <div className="list-row" key={file.id}><div><strong>{file.name}</strong><small>{file.mime_type || 'file'} · {Math.round(Number(file.size_bytes || 0) / 1024)} KB</small></div></div>)}{!files.length && <p className="muted">No files uploaded yet.</p>}</div></article>
    </div>
    <div className="button-row"><a className="secondary-button" href="/connect-google">Google setup</a><a className="secondary-button" href="/dashboard">Return to Luna</a></div>
  </section></main>;
}
