import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateRequest, assertEditor, requireSite } from '@/lib/supabase/request';
import { auditWebsite } from '@/lib/website-audit';
import { inspectSiteSignals } from '@/lib/site-signals';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request); assertEditor(context.role);
    const body = z.object({ siteId: z.string().uuid(), maxPages: z.number().int().min(1).max(25).default(20) }).parse(await request.json());
    const site = await requireSite(context, body.siteId);
    const run = await context.supabase.from('audit_runs').insert({ organization_id: context.organizationId, site_id: site.id, requested_by: context.user.id, audit_type: 'technical', status: 'running', started_at: new Date().toISOString() }).select('*').single();
    if (run.error) throw new Error(run.error.message);

    try {
      const [crawl, signals] = await Promise.all([auditWebsite(site.domain, body.maxPages), inspectSiteSignals(site.domain)]);
      if (crawl.pages.length) {
        const pageSave = await context.supabase.from('audit_pages').insert(crawl.pages.map((page) => ({ ...page, audit_run_id: run.data.id })));
        if (pageSave.error) throw new Error(pageSave.error.message);
      }
      const findings = [...crawl.findings, ...signals.findings];
      if (findings.length) {
        const saved = await context.supabase.from('audit_findings').insert(findings.map((item) => ({ ...item, organization_id: context.organizationId, site_id: site.id, audit_run_id: run.data.id })));
        if (saved.error) throw new Error(saved.error.message);
      }
      const weight = { critical: 18, high: 10, medium: 5, low: 2, info: 0 } as const;
      const summary = {
        ...crawl.summary,
        ...signals.summary,
        findings: findings.length,
        score: Math.max(0, 100 - findings.reduce((total, item) => total + weight[item.severity], 0)),
      };
      await context.supabase.from('audit_runs').update({ status: 'completed', summary, completed_at: new Date().toISOString() }).eq('id', run.data.id);

      const important = findings.filter((item) => ['critical','high','medium'].includes(item.severity)).slice(0, 25);
      if (important.length) {
        await context.supabase.from('recommendations').insert(important.map((item, index) => ({ organization_id: context.organizationId, site_id: site.id, source_type: 'technical_audit', source_id: run.data.id, category: item.category, problem: item.title, recommended_action: item.description, expected_business_value: 'Improve crawlability, search visibility, user experience or conversion readiness.', priority: Math.max(45, 100 - index * 2), effort: item.severity === 'critical' ? 'high' : 'medium', responsible_party: 'Gambix', approval_required: true, status: 'pending_review' })));
      }
      return NextResponse.json({ runId: run.data.id, summary, findings: important });
    } catch (error) {
      await context.supabase.from('audit_runs').update({ status: 'failed', summary: { error: error instanceof Error ? error.message : 'Technical audit failed' }, completed_at: new Date().toISOString() }).eq('id', run.data.id);
      throw error;
    }
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: error.statusText || 'Technical audit failed.' }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Technical audit failed.' }, { status: 400 });
  }
}
