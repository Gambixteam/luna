import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateRequest, assertEditor } from '@/lib/supabase/request';
import { serviceClient } from '@/lib/integrations/google';

function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[character]!)); }
function renderSections(value: unknown): string {
  if (Array.isArray(value)) return `<ul>${value.map((item) => `<li>${renderSections(item)}</li>`).join('')}</ul>`;
  if (value && typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([key,item]) => `<section><h3>${escapeHtml(key.replace(/([A-Z])/g,' $1').replaceAll('_',' '))}</h3>${renderSections(item)}</section>`).join('');
  return `<p>${escapeHtml(String(value ?? ''))}</p>`;
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request); assertEditor(context.role);
    const body = z.object({ reportId: z.string().uuid(), recipient: z.string().email() }).parse(await request.json());
    const report = await context.supabase.from('reports').select('*,sites(display_name,domain)').eq('id', body.reportId).eq('organization_id', context.organizationId).single();
    if (report.error || !report.data) throw new Response('Report not found.', { status: 404 });
    if (report.data.status !== 'approved') throw new Response('Approve the report before delivery.', { status: 409 });
    const apiKey = process.env.RESEND_API_KEY; const from = process.env.REPORT_FROM_EMAIL;
    if (!apiKey || !from) throw new Response('Report email delivery is not configured.', { status: 503 });
    const siteName = report.data.sites?.display_name ?? report.data.sites?.domain ?? 'your business';
    const html = `<div style="font-family:Arial,sans-serif;color:#111;max-width:760px;margin:auto"><h1>Luna monthly report</h1><p><strong>${escapeHtml(siteName)}</strong><br>${escapeHtml(report.data.period_start)} to ${escapeHtml(report.data.period_end)}</p><p>${escapeHtml(report.data.executive_summary ?? '')}</p>${renderSections(report.data.sections)}<hr><p style="color:#666">Prepared by Luna by Gambix. Verified facts, observations and recommendations should be interpreted separately.</p></div>`;
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [body.recipient], subject: `Luna report: ${siteName} — ${report.data.period_end}`, html }), signal: AbortSignal.timeout(20000) });
    const payload = await response.json() as Record<string, any>;
    const admin = serviceClient();
    await admin.from('delivery_events').insert({ organization_id: context.organizationId, site_id: report.data.site_id, resource_type: 'report', resource_id: report.data.id, channel: 'email', recipient: body.recipient, status: response.ok ? 'delivered' : 'failed', provider_message_id: payload.id ?? null, error_message: response.ok ? null : payload.message ?? 'Delivery failed', delivered_at: response.ok ? new Date().toISOString() : null });
    if (!response.ok) throw new Error(payload.message ?? 'Report delivery failed.');
    await admin.from('reports').update({ status: 'completed', delivered_at: new Date().toISOString() }).eq('id', report.data.id);
    return NextResponse.json({ delivered: true, messageId: payload.id });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: error.statusText || 'Report delivery failed.' }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Report delivery failed.' }, { status: 400 });
  }
}
