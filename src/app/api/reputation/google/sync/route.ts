import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateRequest, requireSite } from '@/lib/supabase/request';
import { getGoogleAccessToken, googleJson, serviceClient } from '@/lib/integrations/google';

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const body = z.object({ siteId: z.string().uuid() }).parse(await request.json());
    const site = await requireSite(context, body.siteId);
    const admin = serviceClient();
    const integration = await admin.from('integrations').select('metadata,status').eq('organization_id', context.organizationId).eq('site_id', site.id).eq('provider', 'google_business_profile').single();
    if (integration.error || integration.data.status !== 'connected') throw new Response('Connect and sync Google Business Profile first.', { status: 409 });
    const metadata = integration.data.metadata as Record<string, any>;
    const accounts = (metadata.accounts ?? []) as Array<Record<string, any>>;
    const account = accounts.find((item) => item.name === metadata.selectedAccount) ?? (accounts.length === 1 ? accounts[0] : null);
    const location = metadata.selectedLocation as string | undefined;
    if (!account?.name || !location) throw new Response('Confirm the Google Business Profile account and location first.', { status: 409 });
    const accessToken = await getGoogleAccessToken(context.organizationId!, site.id);
    const locationName = location.replace(/^accounts\/[^/]+\//, '');
    const parent = `${account.name}/${locationName}`;
    const payload = await googleJson(`https://mybusiness.googleapis.com/v4/${parent}/reviews?pageSize=50&orderBy=updateTime desc`, accessToken);
    const reviews = (payload.reviews ?? []) as Array<Record<string, any>>;
    if (reviews.length) {
      const saved = await admin.from('reputation_reviews').upsert(reviews.map((review) => ({
        organization_id: context.organizationId,
        site_id: site.id,
        provider: 'google_business_profile',
        provider_review_name: review.name,
        reviewer_name: review.reviewer?.displayName ?? 'Google user',
        star_rating: review.starRating ?? null,
        comment: review.comment ?? null,
        review_reply: review.reviewReply?.comment ?? null,
        reply_status: review.reviewReply?.comment ? 'published' : 'none',
        create_time: review.createTime ?? null,
        update_time: review.updateTime ?? null,
        raw_data: review,
        updated_at: new Date().toISOString(),
      })), { onConflict: 'site_id,provider_review_name' });
      if (saved.error) throw new Error(saved.error.message);
    }
    return NextResponse.json({ synced: reviews.length, averageRating: payload.averageRating ?? null, totalReviewCount: payload.totalReviewCount ?? reviews.length });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: error.statusText || 'Review sync failed.' }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Review sync failed.' }, { status: 400 });
  }
}
