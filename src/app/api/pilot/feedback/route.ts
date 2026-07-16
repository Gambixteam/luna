import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateRequest, requireSite } from '@/lib/supabase/request';
import { recommendPilotPlan } from '@/lib/pilot-plan';

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    if (!context.organizationId) throw new Response('Complete onboarding before submitting pilot feedback.', { status: 409 });
    const body = z.object({
      siteId: z.string().uuid(),
      satisfactionScore: z.number().int().min(1).max(10),
      mostValuable: z.string().max(3000).optional().default(''),
      missingOrConfusing: z.string().max(3000).optional().default(''),
      likelihoodToContinue: z.number().int().min(1).max(10),
      contentDemand: z.enum(['light','standard','high']).default('standard'),
      needsCallTracking: z.boolean().default(false),
      needsCustomReporting: z.boolean().default(false),
      writtenConversionApproval: z.boolean().default(false),
      testimonialPermission: z.boolean().default(false),
      feedbackSessionCompleted: z.boolean().default(false),
    }).parse(await request.json());
    const site = await requireSite(context, body.siteId);
    const [profile, openTasks] = await Promise.all([
      context.supabase.from('business_profiles').select('service_areas,primary_services').eq('organization_id', context.organizationId).single(),
      context.supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('organization_id', context.organizationId).not('status', 'in', '(completed,archived)'),
    ]);
    const recommendedPlan = recommendPilotPlan({
      locations: profile.data?.service_areas?.length ?? 0,
      primaryServices: profile.data?.primary_services?.length ?? 0,
      openTasks: openTasks.count ?? 0,
      contentDemand: body.contentDemand,
      needsCallTracking: body.needsCallTracking,
      needsCustomReporting: body.needsCustomReporting,
    });
    const saved = await context.supabase.from('pilot_feedback').upsert({
      organization_id: context.organizationId,
      site_id: site.id,
      submitted_by: context.user.id,
      satisfaction_score: body.satisfactionScore,
      most_valuable: body.mostValuable,
      missing_or_confusing: body.missingOrConfusing,
      likelihood_to_continue: body.likelihoodToContinue,
      recommended_plan: recommendedPlan,
      written_conversion_approval: body.writtenConversionApproval,
      testimonial_permission: body.testimonialPermission,
      feedback_session_completed: body.feedbackSessionCompleted,
      feedback_session_date: body.feedbackSessionCompleted ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id' }).select('*').single();
    if (saved.error) throw new Error(saved.error.message);

    const taskTitle = body.writtenConversionApproval ? `Convert Founding 15 client to ${recommendedPlan.replaceAll('_',' ')}` : `Review Founding 15 feedback and recommend ${recommendedPlan.replaceAll('_',' ')}`;
    const existingTask = await context.supabase.from('tasks').select('id').eq('organization_id', context.organizationId).eq('title', taskTitle).not('status', 'in', '(completed,archived)').maybeSingle();
    if (!existingTask.data) await context.supabase.from('tasks').insert({ organization_id: context.organizationId, site_id: site.id, title: taskTitle, category: 'reporting', priority: body.writtenConversionApproval ? 95 : 75, impact: body.writtenConversionApproval ? 'Client has provided written approval to proceed with paid conversion. Confirm agreement and checkout before activation.' : 'Review pilot outcomes, feedback and service-delivery fit before proposing the paid plan.', effort: 'low', status: 'pending_review', approval_required: true, created_by: context.user.id });
    await context.supabase.from('notifications').insert({ organization_id: context.organizationId, user_id: context.user.id, type: 'pilot_feedback_received', title: 'Founding 15 feedback recorded', body: `Luna recommends ${recommendedPlan.replaceAll('_',' ')}. ${body.writtenConversionApproval ? 'Written conversion approval was recorded.' : 'No paid conversion was authorized.'}`, related_type: 'pilot_feedback', related_id: saved.data.id });
    return NextResponse.json({ feedback: saved.data, recommendedPlan, conversionAuthorized: body.writtenConversionApproval });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: error.statusText || 'Pilot feedback failed.' }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Pilot feedback failed.' }, { status: 400 });
  }
}
