import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/supabase/request';
import { serviceClient } from '@/lib/integrations/google';

function assertPlatformAdmin(email: string | undefined) {
  const allowed = (process.env.GAMBIX_ADMIN_EMAILS ?? '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!email || !allowed.includes(email.toLowerCase())) throw new Response('Gambix administrator access required.', { status: 403 });
}

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request); assertPlatformAdmin(context.user.email);
    const admin = serviceClient();
    const [organizations, profiles, sites, subscriptions, onboarding, integrations, tasks, approvals, reports] = await Promise.all([
      admin.from('organizations').select('*').order('created_at', { ascending: false }),
      admin.from('business_profiles').select('*'), admin.from('sites').select('*'), admin.from('subscriptions').select('*'),
      admin.from('onboarding_submissions').select('*').order('created_at', { ascending: false }), admin.from('integrations').select('*'),
      admin.from('tasks').select('*'), admin.from('approvals').select('*'), admin.from('reports').select('*'),
    ]);
    for (const result of [organizations, profiles, sites, subscriptions, onboarding, integrations, tasks, approvals, reports]) if (result.error) throw new Error(result.error.message);
    const rows = (organizations.data ?? []).map((organization) => {
      const organizationSites = (sites.data ?? []).filter((item) => item.organization_id === organization.id);
      const organizationIntegrations = (integrations.data ?? []).filter((item) => item.organization_id === organization.id);
      const organizationTasks = (tasks.data ?? []).filter((item) => item.organization_id === organization.id);
      const organizationApprovals = (approvals.data ?? []).filter((item) => item.organization_id === organization.id);
      const organizationReports = (reports.data ?? []).filter((item) => item.organization_id === organization.id);
      const latestOnboarding = (onboarding.data ?? []).find((item) => item.organization_id === organization.id);
      return {
        ...organization,
        businessProfile: (profiles.data ?? []).find((item) => item.organization_id === organization.id) ?? null,
        sites: organizationSites,
        subscription: (subscriptions.data ?? []).find((item) => item.organization_id === organization.id) ?? null,
        onboardingStatus: latestOnboarding?.status ?? 'not_started',
        missingAccess: organizationIntegrations.filter((item) => item.status !== 'connected').map((item) => item.provider),
        tasksDue: organizationTasks.filter((item) => !['completed','archived'].includes(item.status)).length,
        overdueTasks: organizationTasks.filter((item) => item.due_date && item.due_date < new Date().toISOString().slice(0, 10) && item.status !== 'completed').length,
        pendingApprovals: organizationApprovals.filter((item) => item.status === 'pending').length,
        reportsDue: organizationReports.filter((item) => !['approved','completed'].includes(item.status)).length,
        clientHealth: organization.account_status === 'blocked' ? 'critical' : organizationTasks.some((item) => item.status === 'blocked') || organizationIntegrations.filter((item) => item.status !== 'connected').length >= 3 ? 'at_risk' : 'healthy',
      };
    });
    return NextResponse.json({ organizations: rows });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: error.statusText || 'Admin access denied.' }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load portfolio.' }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request); assertPlatformAdmin(context.user.email);
    const body = z.object({ organizationId: z.string().uuid(), accountStatus: z.enum(['active','paused','blocked','pilot']).optional(), planKey: z.enum(['founding_15','luna_core','luna_plus','luna_scale']).optional(), renewalDate: z.string().nullable().optional() }).parse(await request.json());
    const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.accountStatus) changes.account_status = body.accountStatus;
    if (body.planKey) changes.plan_key = body.planKey;
    if (body.renewalDate !== undefined) changes.renewal_date = body.renewalDate;
    const admin = serviceClient();
    const updated = await admin.from('organizations').update(changes).eq('id', body.organizationId).select('*').single();
    if (updated.error) throw new Error(updated.error.message);
    if (body.planKey) await admin.from('subscriptions').update({ plan_key: body.planKey, updated_at: new Date().toISOString() }).eq('organization_id', body.organizationId);
    return NextResponse.json({ organization: updated.data });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: error.statusText || 'Admin access denied.' }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update client.' }, { status: 400 });
  }
}
