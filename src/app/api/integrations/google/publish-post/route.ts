import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateRequest, assertEditor, requireSite } from '@/lib/supabase/request';
import { getGoogleAccessToken, googleJson, serviceClient } from '@/lib/integrations/google';

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request); assertEditor(context.role);
    const body = z.object({ contentId: z.string().uuid() }).parse(await request.json());
    const admin = serviceClient();
    const content = await context.supabase.from('content_items').select('*').eq('id', body.contentId).eq('organization_id', context.organizationId).single();
    if (content.error || !content.data) throw new Response('GBP post not found.', { status: 404 });
    if (content.data.content_type !== 'gbp_post') throw new Response('This content item is not a GBP post.', { status: 400 });
    if (content.data.status !== 'approved') throw new Response('The GBP post must be approved before publishing.', { status: 409 });
    const approval = await context.supabase.from('approvals').select('*').eq('resource_type', 'content_item').eq('resource_id', content.data.id).eq('status', 'approved').maybeSingle();
    if (!approval.data) throw new Response('No approved publication request exists.', { status: 409 });
    const site = await requireSite(context, content.data.site_id);
    const integration = await admin.from('integrations').select('metadata,status').eq('organization_id', context.organizationId).eq('site_id', site.id).eq('provider', 'google_business_profile').single();
    if (integration.error || integration.data.status !== 'connected') throw new Response('Connect and sync Google Business Profile first.', { status: 409 });
    const metadata = integration.data.metadata as Record<string, any>;
    const accounts = (metadata.accounts ?? []) as Array<Record<string, any>>;
    const account = accounts.find((item) => item.name === metadata.selectedAccount) ?? (accounts.length === 1 ? accounts[0] : null);
    const location = metadata.selectedLocation as string | undefined;
    if (!account?.name || !location) throw new Response('Confirm the Google Business Profile account and location before publishing.', { status: 409 });
    const accessToken = await getGoogleAccessToken(context.organizationId!, site.id);
    const summary = String(content.data.draft ?? '').replace(/^#+\s*/gm, '').trim().slice(0, 1500);
    if (!summary) throw new Response('The approved post has no content.', { status: 409 });
    const parent = `${account.name}/${location.replace(/^accounts\/[^/]+\//, '')}`;
    const published = await googleJson(`https://mybusiness.googleapis.com/v4/${parent}/localPosts`, accessToken, { method: 'POST', body: JSON.stringify({ languageCode: 'en-US', summary, topicType: 'STANDARD', callToAction: { actionType: 'LEARN_MORE', url: site.domain } }) });
    await admin.from('content_items').update({ status: 'completed', publication_url: published.name ?? null, publication_date: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() }).eq('id', content.data.id);
    await admin.from('approvals').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', approval.data.id);
    return NextResponse.json({ published });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: error.statusText || 'GBP publication failed.' }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'GBP publication failed.' }, { status: 400 });
  }
}
