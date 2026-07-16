import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateRequest, assertEditor, requireSite } from '@/lib/supabase/request';
import { auditWebsite } from '@/lib/website-audit';
import { generateLunaJson } from '@/lib/luna-ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

function jsonError(error: unknown) {
  if (error instanceof Response) return NextResponse.json({ error: error.statusText || 'Request failed.' }, { status: error.status });
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed.' }, { status: 400 });
}

async function readBody(request: NextRequest) {
  try { return await request.json() as Record<string, unknown>; } catch { return {}; }
}

async function handleOnboarding(request: NextRequest) {
  const context = await authenticateRequest(request);
  const body = await readBody(request);
  const schema = z.object({
    businessName: z.string().min(2).max(160), website: z.string().min(3).max(500), phone: z.string().max(50).optional().default(''),
    primaryServices: z.array(z.string().min(1)).min(1).max(20), serviceAreas: z.array(z.string().min(1)).min(1).max(50),
    targetCustomers: z.string().max(2000).optional().default(''), brandVoice: z.string().max(2000).optional().default(''),
    competitors: z.array(z.string()).max(15).default([]), goals: z.string().max(3000).optional().default(''),
    leadSources: z.array(z.string()).max(20).default([]), agreementAcknowledged: z.boolean(),
  });
  const data = schema.parse(body);
  let organizationId = context.organizationId;
  if (!organizationId) {
    const created = await context.supabase.rpc('create_organization_with_owner', { org_name: data.businessName, plan: 'founding_15' });
    if (created.error || !created.data) throw new Error(created.error?.message ?? 'Unable to create Luna account.');
    organizationId = created.data as string;
  }
  const normalized = new URL(/^https?:\/\//i.test(data.website) ? data.website : `https://${data.website}`).toString();
  const profile = await context.supabase.from('business_profiles').upsert({ organization_id: organizationId, business_name: data.businessName, website: normalized, phone: data.phone, primary_services: data.primaryServices, service_areas: data.serviceAreas, target_locations: data.serviceAreas, target_customers: data.targetCustomers, brand_voice: data.brandVoice, competitors: data.competitors, goals: data.goals, lead_sources: data.leadSources, updated_at: new Date().toISOString() });
  if (profile.error) throw new Error(profile.error.message);
  const site = await context.supabase.from('sites').upsert({ organization_id: organizationId, domain: normalized, display_name: data.businessName, verification_status: 'pending' }, { onConflict: 'organization_id,domain' }).select('*').single();
  if (site.error) throw new Error(site.error.message);
  const onboarding = await context.supabase.from('onboarding_submissions').insert({ organization_id: organizationId, submitted_by: context.user.id, status: 'submitted', form_data: data, agreement_acknowledged: data.agreementAcknowledged, submitted_at: new Date().toISOString() });
  if (onboarding.error) throw new Error(onboarding.error.message);
  const providers = ['google_search_console','google_analytics_4','google_business_profile','wordpress','gohighlevel','google_drive','clickup'];
  await context.supabase.from('integrations').insert(providers.map((provider) => ({ organization_id: organizationId, site_id: site.data.id, provider, status: 'disconnected' })));
  return NextResponse.json({ organizationId, site: site.data });
}

async function handleAudit(request: NextRequest) {
  const context = await authenticateRequest(request); assertEditor(context.role);
  const body = z.object({ siteId: z.string().uuid() }).parse(await readBody(request));
  const site = await requireSite(context, body.siteId);
  const run = await context.supabase.from('audit_runs').insert({ organization_id: context.organizationId, site_id: site.id, requested_by: context.user.id, audit_type: 'website', status: 'running', started_at: new Date().toISOString() }).select('*').single();
  if (run.error) throw new Error(run.error.message);
  try {
    const audit = await auditWebsite(site.domain, 12);
    if (audit.pages.length) {
      const pages = await context.supabase.from('audit_pages').insert(audit.pages.map((page) => ({ ...page, audit_run_id: run.data.id })));
      if (pages.error) throw new Error(pages.error.message);
    }
    if (audit.findings.length) {
      const findings = await context.supabase.from('audit_findings').insert(audit.findings.map((finding) => ({ ...finding, organization_id: context.organizationId, site_id: site.id, audit_run_id: run.data.id })));
      if (findings.error) throw new Error(findings.error.message);
      const top = audit.findings.filter((item) => ['critical','high','medium'].includes(item.severity)).slice(0, 20);
      await context.supabase.from('recommendations').insert(top.map((item, index) => ({ organization_id: context.organizationId, site_id: site.id, source_type: 'audit', source_id: run.data.id, category: item.category, problem: item.title, recommended_action: item.description, expected_business_value: 'Improve search visibility, user trust or conversion readiness.', priority: Math.max(50, 100 - index * 3), effort: item.severity === 'critical' ? 'high' : 'medium', responsible_party: 'Gambix', approval_required: true, status: 'pending_review' })));
      await context.supabase.from('tasks').insert(top.slice(0, 10).map((item, index) => ({ organization_id: context.organizationId, site_id: site.id, title: item.title, category: item.category, priority: Math.max(50, 100 - index * 4), impact: item.description, effort: item.severity === 'critical' ? 'high' : 'medium', status: 'draft', approval_required: true, created_by: context.user.id })));
    }
    await context.supabase.from('audit_runs').update({ status: 'completed', summary: audit.summary, completed_at: new Date().toISOString() }).eq('id', run.data.id);
    return NextResponse.json({ runId: run.data.id, ...audit.summary });
  } catch (error) {
    await context.supabase.from('audit_runs').update({ status: 'failed', summary: { error: error instanceof Error ? error.message : 'Audit failed' }, completed_at: new Date().toISOString() }).eq('id', run.data.id);
    throw error;
  }
}

async function handleKeywords(request: NextRequest) {
  const context = await authenticateRequest(request); assertEditor(context.role);
  const body = z.object({ siteId: z.string().uuid() }).parse(await readBody(request));
  const site = await requireSite(context, body.siteId);
  const profile = await context.supabase.from('business_profiles').select('*').eq('organization_id', context.organizationId).single();
  const services = profile.data?.primary_services ?? []; const locations = profile.data?.service_areas ?? [];
  const fallbackKeywords = services.flatMap((service: string) => locations.slice(0, 5).flatMap((location: string) => [
    { keyword: `${service} ${location}`, service, location, intent: 'commercial', priority: 90 },
    { keyword: `best ${service} in ${location}`, service, location, intent: 'commercial', priority: 80 },
    { keyword: `${service} near me`, service, location, intent: 'local', priority: 85 },
    { keyword: `emergency ${service} ${location}`, service, location, intent: 'urgent', priority: 88 },
  ])).slice(0, 60);
  const generated = await generateLunaJson({ supabase: context.supabase, user: context.user, organizationId: context.organizationId!, siteId: site.id, feature: 'keyword_research', idempotencyKey: `keywords-${site.id}-${Date.now()}`, system: 'You are Luna, Gambix\'s local SEO strategist. Build commercially useful local keyword targets.', prompt: JSON.stringify({ business: profile.data, website: site.domain, requiredShape: { keywords: [{ keyword: 'string', service: 'string', location: 'string', intent: 'commercial|informational|local|urgent', priority: 0 }] } }), fallback: { keywords: fallbackKeywords }, maxTokens: 2600 });
  const keywords = Array.isArray(generated.keywords) ? generated.keywords : fallbackKeywords;
  const clean = keywords.slice(0, 100).map((item: unknown) => { const row = item as Record<string, unknown>; return { organization_id: context.organizationId, site_id: site.id, keyword: String(row.keyword ?? ''), service: String(row.service ?? ''), location: String(row.location ?? ''), intent: String(row.intent ?? 'commercial'), priority: Math.max(0, Math.min(100, Number(row.priority ?? 50))), source: 'luna' }; }).filter((row) => row.keyword);
  await context.supabase.from('keyword_targets').delete().eq('site_id', site.id).eq('source', 'luna');
  const inserted = await context.supabase.from('keyword_targets').insert(clean).select('*');
  if (inserted.error) throw new Error(inserted.error.message);
  return NextResponse.json({ keywords: inserted.data });
}

async function handleStrategy(request: NextRequest) {
  const context = await authenticateRequest(request); assertEditor(context.role);
  const body = z.object({ siteId: z.string().uuid() }).parse(await readBody(request));
  const site = await requireSite(context, body.siteId);
  const [profile, findings, keywords, competitors, analytics, previous] = await Promise.all([
    context.supabase.from('business_profiles').select('*').eq('organization_id', context.organizationId).single(),
    context.supabase.from('audit_findings').select('*').eq('site_id', site.id).eq('status', 'open').limit(80),
    context.supabase.from('keyword_targets').select('*').eq('site_id', site.id).order('priority', { ascending: false }).limit(80),
    context.supabase.from('competitors').select('*').eq('site_id', site.id).limit(15),
    context.supabase.from('analytics_snapshots').select('*').eq('site_id', site.id).order('period_end', { ascending: false }).limit(12),
    context.supabase.from('strategies').select('version').eq('site_id', site.id).order('version', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const fallback = { executiveDiagnosis: 'Luna has converted the available business, audit and keyword data into a prioritized local growth plan. Human review is required before execution.', primaryGoals: ['Improve qualified local search visibility','Strengthen conversion paths','Build consistent service and location coverage'], keywordStrategy: (keywords.data ?? []).slice(0, 20), technicalPriorities: (findings.data ?? []).filter((item) => ['technical','schema'].includes(item.category)).slice(0, 10), contentPriorities: (keywords.data ?? []).slice(0, 12).map((item) => ({ title: `${item.service || item.keyword} in ${item.location || 'target service area'}`, keyword: item.keyword })), localPriorities: ['Complete and align Google Business Profile','Resolve citation inconsistencies','Build location-relevant trust signals'], conversionPriorities: ['Make primary calls to action persistent and mobile-friendly','Add verified proof near service conversion points'], days30: ['Resolve critical technical findings','Finalize keyword-to-page map','Optimize primary service pages'], days60: ['Publish priority service and location content','Improve internal linking','Launch citation cleanup'], days90: ['Refresh underperforming pages','Expand local authority and reviews','Measure qualified leads and adjust priorities'], measurementPlan: ['Search Console clicks and CTR','GA4 organic conversions','GBP interactions','Calls, forms and bookings'], risks: ['Missing analytics access','Delayed approvals','Unsupported business claims'], recommendedPlan: 'luna_core' };
  const strategy = await generateLunaJson({ supabase: context.supabase, user: context.user, organizationId: context.organizationId!, siteId: site.id, feature: 'draft_strategy', idempotencyKey: `strategy-${site.id}-${Date.now()}`, system: 'Create a practical, evidence-backed SEO, local visibility, content and conversion strategy for a service business. Separate verified facts from hypotheses.', prompt: JSON.stringify({ business: profile.data, site, findings: findings.data, keywords: keywords.data, competitors: competitors.data, analytics: analytics.data, requiredSections: Object.keys(fallback) }), fallback, maxTokens: 3600 });
  const version = Number(previous.data?.version ?? 0) + 1;
  const saved = await context.supabase.from('strategies').insert({ organization_id: context.organizationId, site_id: site.id, version, title: `Luna 90-Day Growth Strategy v${version}`, status: 'pending_review', content: strategy, created_by: context.user.id }).select('*').single();
  if (saved.error) throw new Error(saved.error.message);
  await context.supabase.from('approvals').insert({ organization_id: context.organizationId, site_id: site.id, approval_type: 'strategy', resource_type: 'strategy', resource_id: saved.data.id, title: saved.data.title, summary: 'Review the strategy before it becomes active.', proposed_state: strategy, requested_by: context.user.id });
  return NextResponse.json({ strategy: saved.data });
}

async function handleContent(request: NextRequest) {
  const context = await authenticateRequest(request); assertEditor(context.role);
  const body = z.object({ siteId: z.string().uuid(), contentType: z.string().min(2).max(80), title: z.string().min(3).max(240), targetKeyword: z.string().min(2).max(240), audience: z.string().max(1000).optional().default('Local service customers') }).parse(await readBody(request));
  const site = await requireSite(context, body.siteId);
  const profile = await context.supabase.from('business_profiles').select('*').eq('organization_id', context.organizationId).single();
  const fallback = { brief: { searchIntent: 'commercial', audience: body.audience, structure: ['Clear outcome-focused introduction','Service explanation','Process','Trust and proof','Local relevance','Frequently asked questions','Call to action'], requiredFacts: ['Only use claims approved by the client'], internalLinks: ['Primary service page','Contact page'], cta: 'Request service or schedule a consultation' }, draft: `# ${body.title}\n\nThis draft requires Gambix and client review before publication. It should explain the service clearly, address the needs of ${body.audience}, establish local relevance, and guide the reader toward a direct conversion action.`, secondaryKeywords: [], cta: 'Request service', localRelevance: (profile.data?.service_areas ?? []).join(', '), recommendedWordMin: 800, recommendedWordMax: 1400 };
  const generated = await generateLunaJson({ supabase: context.supabase, user: context.user, organizationId: context.organizationId!, siteId: site.id, feature: 'content_draft', idempotencyKey: `content-${site.id}-${Date.now()}`, system: 'Create an original, useful local SEO content brief and first draft. Do not invent reviews, licenses, prices, guarantees, statistics, addresses or case-study results.', prompt: JSON.stringify({ business: profile.data, site, request: body, requiredShape: fallback }), fallback, maxTokens: 3800 });
  const saved = await context.supabase.from('content_items').insert({ organization_id: context.organizationId, site_id: site.id, content_type: body.contentType, title: body.title, target_keyword: body.targetKeyword, secondary_keywords: generated.secondaryKeywords ?? [], search_intent: (generated.brief as Record<string, unknown> | undefined)?.searchIntent ?? 'commercial', target_audience: body.audience, recommended_word_min: generated.recommendedWordMin ?? 800, recommended_word_max: generated.recommendedWordMax ?? 1400, brief: generated.brief ?? {}, draft: String(generated.draft ?? ''), cta: String(generated.cta ?? ''), local_relevance: String(generated.localRelevance ?? ''), status: 'pending_review' }).select('*').single();
  if (saved.error) throw new Error(saved.error.message);
  await context.supabase.from('approvals').insert({ organization_id: context.organizationId, site_id: site.id, approval_type: body.contentType === 'gbp_post' ? 'gbp_post' : 'content', resource_type: 'content_item', resource_id: saved.data.id, title: `Review: ${body.title}`, summary: 'Review facts, brand voice, compliance and publication readiness.', proposed_state: { brief: saved.data.brief, draft: saved.data.draft }, requested_by: context.user.id });
  return NextResponse.json({ content: saved.data });
}

async function handleTask(request: NextRequest) {
  const context = await authenticateRequest(request); assertEditor(context.role);
  const body = z.object({ siteId: z.string().uuid().optional(), id: z.string().uuid().optional(), title: z.string().min(2).max(240).optional(), category: z.string().max(80).optional(), priority: z.number().min(0).max(100).optional(), status: z.string().max(40).optional(), dueDate: z.string().optional(), notes: z.string().max(3000).optional() }).parse(await readBody(request));
  if (body.id) { const updated = await context.supabase.from('tasks').update({ status: body.status, completion_notes: body.notes, due_date: body.dueDate }).eq('id', body.id).eq('organization_id', context.organizationId).select('*').single(); if (updated.error) throw new Error(updated.error.message); return NextResponse.json({ task: updated.data }); }
  if (!body.title || !body.category) throw new Error('Task title and category are required.');
  if (body.siteId) await requireSite(context, body.siteId);
  const saved = await context.supabase.from('tasks').insert({ organization_id: context.organizationId, site_id: body.siteId, title: body.title, category: body.category, priority: body.priority ?? 50, status: body.status ?? 'draft', due_date: body.dueDate, completion_notes: body.notes, created_by: context.user.id }).select('*').single();
  if (saved.error) throw new Error(saved.error.message);
  return NextResponse.json({ task: saved.data });
}

async function handleApproval(request: NextRequest) {
  const context = await authenticateRequest(request);
  const body = z.object({ id: z.string().uuid(), decision: z.enum(['approved','rejected','revision_requested']), reason: z.string().max(3000).optional().default('') }).parse(await readBody(request));
  const updated = await context.supabase.from('approvals').update({ status: body.decision, decided_by: context.user.id, decided_at: new Date().toISOString(), rejection_reason: body.decision === 'rejected' ? body.reason : null, revision_request: body.decision === 'revision_requested' ? body.reason : null }).eq('id', body.id).eq('organization_id', context.organizationId).select('*').single();
  if (updated.error) throw new Error(updated.error.message);
  if (body.decision === 'approved' && updated.data.resource_id) { const table = updated.data.resource_type === 'strategy' ? 'strategies' : updated.data.resource_type === 'content_item' ? 'content_items' : updated.data.resource_type === 'report' ? 'reports' : null; if (table) await context.supabase.from(table).update({ status: 'approved' }).eq('id', updated.data.resource_id); }
  return NextResponse.json({ approval: updated.data });
}

async function handleReport(request: NextRequest) {
  const context = await authenticateRequest(request); assertEditor(context.role);
  const body = z.object({ siteId: z.string().uuid(), periodStart: z.string(), periodEnd: z.string() }).parse(await readBody(request));
  const site = await requireSite(context, body.siteId);
  const [audits, findings, tasks, analytics, content, ranks, citations] = await Promise.all([
    context.supabase.from('audit_runs').select('*').eq('site_id', site.id).gte('created_at', body.periodStart).lte('created_at', `${body.periodEnd}T23:59:59Z`),
    context.supabase.from('audit_findings').select('*').eq('site_id', site.id), context.supabase.from('tasks').select('*').eq('site_id', site.id),
    context.supabase.from('analytics_snapshots').select('*').eq('site_id', site.id).gte('period_end', body.periodStart).lte('period_end', body.periodEnd),
    context.supabase.from('content_items').select('*').eq('site_id', site.id).gte('created_at', body.periodStart).lte('created_at', `${body.periodEnd}T23:59:59Z`),
    context.supabase.from('rank_snapshots').select('*').eq('site_id', site.id).gte('captured_on', body.periodStart).lte('captured_on', body.periodEnd), context.supabase.from('citations').select('*').eq('site_id', site.id),
  ]);
  const fallback = { executiveSummary: `Luna reviewed ${audits.data?.length ?? 0} audits, ${tasks.data?.filter((item) => item.status === 'completed').length ?? 0} completed tasks, and ${content.data?.length ?? 0} content items for this period.`, keyMetrics: analytics.data ?? [], workCompleted: tasks.data?.filter((item) => item.status === 'completed') ?? [], searchVisibility: ranks.data ?? [], contentPublished: content.data ?? [], technicalImprovements: findings.data?.filter((item) => item.status === 'resolved') ?? [], citationProgress: citations.data ?? [], risksAndBlockers: tasks.data?.filter((item) => item.status === 'blocked') ?? [], nextMonthPriorities: tasks.data?.filter((item) => !['completed','archived'].includes(item.status)).slice(0, 10) ?? [] };
  const generated = await generateLunaJson({ supabase: context.supabase, user: context.user, organizationId: context.organizationId!, siteId: site.id, feature: 'monthly_report', idempotencyKey: `report-${site.id}-${body.periodStart}-${body.periodEnd}`, system: 'Create a plain-English monthly Luna report. Distinguish verified metrics from observations and recommendations. Never claim causation without evidence.', prompt: JSON.stringify({ site, period: body, data: fallback, requiredShape: fallback }), fallback, maxTokens: 3200 });
  const saved = await context.supabase.from('reports').insert({ organization_id: context.organizationId, site_id: site.id, report_type: 'monthly', period_start: body.periodStart, period_end: body.periodEnd, status: 'pending_review', executive_summary: String(generated.executiveSummary ?? fallback.executiveSummary), sections: generated }).select('*').single();
  if (saved.error) throw new Error(saved.error.message);
  await context.supabase.from('approvals').insert({ organization_id: context.organizationId, site_id: site.id, approval_type: 'report', resource_type: 'report', resource_id: saved.data.id, title: `Monthly Luna report: ${body.periodStart} to ${body.periodEnd}`, summary: saved.data.executive_summary, proposed_state: generated, requested_by: context.user.id });
  return NextResponse.json({ report: saved.data });
}

async function handleCitation(request: NextRequest) {
  const context = await authenticateRequest(request); assertEditor(context.role);
  const body = z.object({ siteId: z.string().uuid(), directoryName: z.string().min(2).max(160), listingUrl: z.string().max(500).optional(), status: z.string().max(40).default('missing'), napConsistent: z.boolean().optional(), notes: z.string().max(2000).optional() }).parse(await readBody(request));
  const site = await requireSite(context, body.siteId);
  const saved = await context.supabase.from('citations').insert({ organization_id: context.organizationId, site_id: site.id, directory_name: body.directoryName, listing_url: body.listingUrl, status: body.status, nap_consistent: body.napConsistent, notes: body.notes, last_reviewed_at: new Date().toISOString() }).select('*').single();
  if (saved.error) throw new Error(saved.error.message);
  return NextResponse.json({ citation: saved.data });
}

async function handleAnalytics(request: NextRequest) {
  const context = await authenticateRequest(request); assertEditor(context.role);
  const body = z.object({ siteId: z.string().uuid(), source: z.enum(['ga4','gsc','gbp','ghl','forms','calls','bookings']), periodStart: z.string(), periodEnd: z.string(), metrics: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])), dimensions: z.record(z.string(), z.unknown()).optional().default({}) }).parse(await readBody(request));
  const site = await requireSite(context, body.siteId);
  const saved = await context.supabase.from('analytics_snapshots').insert({ organization_id: context.organizationId, site_id: site.id, source: body.source, period_start: body.periodStart, period_end: body.periodEnd, metrics: body.metrics, dimensions: body.dimensions }).select('*').single();
  if (saved.error) throw new Error(saved.error.message);
  return NextResponse.json({ snapshot: saved.data });
}

async function handleIntegration(request: NextRequest) {
  const context = await authenticateRequest(request);
  const body = z.object({ siteId: z.string().uuid(), provider: z.string().min(2).max(100), status: z.enum(['disconnected','needs_attention','connected']).default('needs_attention') }).parse(await readBody(request));
  const site = await requireSite(context, body.siteId);
  const existing = await context.supabase.from('integrations').select('id').eq('organization_id', context.organizationId).eq('site_id', site.id).eq('provider', body.provider).maybeSingle();
  const payload = { organization_id: context.organizationId, site_id: site.id, provider: body.provider, status: body.status, updated_at: new Date().toISOString(), metadata: { requestedBy: context.user.email } };
  const saved = existing.data?.id ? await context.supabase.from('integrations').update(payload).eq('id', existing.data.id).select('*').single() : await context.supabase.from('integrations').insert(payload).select('*').single();
  if (saved.error) throw new Error(saved.error.message);
  return NextResponse.json({ integration: saved.data });
}

const handlers: Record<string, (request: NextRequest) => Promise<NextResponse>> = { onboarding: handleOnboarding, audit: handleAudit, keywords: handleKeywords, strategy: handleStrategy, content: handleContent, task: handleTask, approval: handleApproval, report: handleReport, citation: handleCitation, analytics: handleAnalytics, integration: handleIntegration };

export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  try { const { action } = await context.params; const handler = handlers[action]; if (!handler) return NextResponse.json({ error: 'Unknown Luna action.' }, { status: 404 }); return await handler(request); } catch (error) { return jsonError(error); }
}
