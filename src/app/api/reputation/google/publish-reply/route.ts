import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateRequest, assertEditor } from '@/lib/supabase/request';
import { getGoogleAccessToken, googleJson, serviceClient } from '@/lib/integrations/google';

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request); assertEditor(context.role);
    const body = z.object({ reviewId: z.string().uuid() }).parse(await request.json());
    const review = await context.supabase.from('reputation_reviews').select('*').eq('id', body.reviewId).eq('organization_id', context.organizationId).single();
    if (review.error || !review.data) throw new Response('Review not found.', { status: 404 });
    if (!review.data.review_reply?.trim()) throw new Response('Draft a reply before publishing.', { status: 409 });
    if (review.data.reply_status === 'published') throw new Response('This reply is already published.', { status: 409 });
    const approval = await context.supabase.from('approvals').select('*').eq('resource_type', 'reputation_review').eq('resource_id', review.data.id).eq('status', 'approved').maybeSingle();
    if (!approval.data) throw new Response('The review reply must be approved before publishing.', { status: 409 });
    const accessToken = await getGoogleAccessToken(context.organizationId!, review.data.site_id);
    const published = await googleJson(`https://mybusiness.googleapis.com/v4/${review.data.provider_review_name}/reply`, accessToken, { method: 'PUT', body: JSON.stringify({ comment: review.data.review_reply }) });
    const admin = serviceClient();
    await admin.from('reputation_reviews').update({ reply_status: 'published', review_reply: published.comment ?? review.data.review_reply, updated_at: new Date().toISOString() }).eq('id', review.data.id);
    await admin.from('approvals').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', approval.data.id);
    return NextResponse.json({ reply: published });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: error.statusText || 'Review reply failed.' }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Review reply failed.' }, { status: 400 });
  }
}
