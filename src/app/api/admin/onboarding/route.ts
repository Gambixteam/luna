import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/supabase/request';
import { serviceClient } from '@/lib/integrations/google';

function requireAdmin(email: string | undefined) {
  const allowed = (process.env.GAMBIX_ADMIN_EMAILS ?? '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!email || !allowed.includes(email.toLowerCase())) throw new Response('Gambix administrator access required.', { status: 403 });
}

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request); requireAdmin(context.user.email);
    const admin = serviceClient();
    const [submissions, organizations, profiles, sites, integrations] = await Promise.all([
      admin.from('onboarding_submissions').select('*').order('created_at', { ascending: false }),
      admin.from('organizations').select('*'), admin.from('business_profiles').select('*'), admin.from('sites').select('*'), admin.from('integrations').select('*'),
    ]);
    for (const result of [submissions, organizations, profiles, sites, integrations]) if (result.error) throw new Error(result.error.message);
    const rows = (submissions.data ?? []).map((submission) => {
      const organization = (organizations.data ?? []).find((item) => item.id === submission.organization_id);
      const profile = (profiles.data ?? []).find((item) => item.organization_id === submission.organization_id);
      const site = (sites.data ?? []).find((item) => item.organization_id === submission.organization_id);
      const access = (integrations.data ?? []).filter((item) => item.organization_id === submission.organization_id);
      return { ...submission, organization, profile, site, access, missingAccess: access.filter((item) => item.status !== 'connected').map((item) => item.provider) };
    });
    return NextResponse.json({ submissions: rows });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: error.statusText || 'Admin access denied.' }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load onboarding.' }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request); requireAdmin(context.user.email);
    const body = z.object({
      submissionId: z.string().uuid(),
      status: z.enum(['in_progress','submitted','needs_access','reviewing','complete']),
      checklist: z.record(z.string(), z.boolean()),
    }).parse(await request.json());
    const admin = serviceClient();
    const updated = await admin.from('onboarding_submissions').update({ status: body.status, internal_checklist: body.checklist, updated_at: new Date().toISOString() }).eq('id', body.submissionId).select('*').single();
    if (updated.error) throw new Error(updated.error.message);
    const owner = await admin.from('organizations').select('owner_user_id').eq('id', updated.data.organization_id).single();
    if (owner.data?.owner_user_id) await admin.from('notifications').insert({ organization_id: updated.data.organization_id, user_id: owner.data.owner_user_id, type: 'onboarding_status', title: `Luna onboarding: ${body.status.replaceAll('_',' ')}`, body: body.status === 'complete' ? 'Your Luna onboarding has been reviewed and marked complete.' : body.status === 'needs_access' ? 'Gambix still needs account access before service delivery can continue.' : 'Gambix updated your onboarding status.', related_type: 'onboarding_submission', related_id: updated.data.id });
    return NextResponse.json({ submission: updated.data });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: error.statusText || 'Admin access denied.' }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update onboarding.' }, { status: 400 });
  }
}
