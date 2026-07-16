import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateRequest, assertEditor } from '@/lib/supabase/request';
import { generateLunaJson } from '@/lib/luna-ai';

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request); assertEditor(context.role);
    const body = z.object({ reviewId: z.string().uuid() }).parse(await request.json());
    const [review, profile] = await Promise.all([
      context.supabase.from('reputation_reviews').select('*').eq('id', body.reviewId).eq('organization_id', context.organizationId).single(),
      context.supabase.from('business_profiles').select('*').eq('organization_id', context.organizationId).single(),
    ]);
    if (review.error || !review.data) throw new Response('Review not found.', { status: 404 });
    const reviewData = review.data as Record<string, any>;
    if (reviewData.reply_status === 'published') throw new Response('This review already has a published reply.', { status: 409 });
    const rating = String(reviewData.star_rating ?? '');
    const fallbackReply = /ONE|TWO/i.test(rating)
      ? 'Thank you for sharing your feedback. We are sorry your experience did not meet expectations. Please contact our team directly so we can understand what happened and work toward an appropriate resolution.'
      : 'Thank you for taking the time to share your experience. We appreciate your feedback and the opportunity to serve you.';
    const generated = await generateLunaJson({
      supabase: context.supabase,
      user: context.user,
      organizationId: context.organizationId!,
      siteId: reviewData.site_id,
      feature: 'review_response',
      idempotencyKey: `review-reply-${reviewData.id}-${Date.now()}`,
      system: 'Draft a concise, professional Google review response. Never admit legal liability, disclose private information, offer prohibited incentives, or claim facts not present in the review or approved business profile.',
      prompt: JSON.stringify({ reviewer: reviewData.reviewer_name, rating: reviewData.star_rating, review: reviewData.comment, business: profile.data ?? null, requiredShape: { reply: 'string' } }),
      fallback: { reply: fallbackReply },
      maxTokens: 500,
    });
    const reply = String(generated.reply ?? fallbackReply).slice(0, 4096);
    const updated = await context.supabase.from('reputation_reviews').update({ review_reply: reply, reply_status: 'pending_review', updated_at: new Date().toISOString() }).eq('id', reviewData.id).select('*').single();
    if (updated.error) throw new Error(updated.error.message);
    const existing = await context.supabase.from('approvals').select('id').eq('resource_type', 'reputation_review').eq('resource_id', reviewData.id).eq('status', 'pending').maybeSingle();
    if (!existing.data) await context.supabase.from('approvals').insert({ organization_id: context.organizationId, site_id: reviewData.site_id, approval_type: 'content', resource_type: 'reputation_review', resource_id: reviewData.id, title: `Review response: ${reviewData.reviewer_name ?? 'Google reviewer'}`, summary: reviewData.comment ?? 'Review without written comment', proposed_state: { reply }, requested_by: context.user.id });
    return NextResponse.json({ review: updated.data });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: error.statusText || 'Reply drafting failed.' }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Reply drafting failed.' }, { status: 400 });
  }
}
