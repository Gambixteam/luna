import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateRequest, assertEditor } from '@/lib/supabase/request';
import { decryptSecret, serviceClient } from '@/lib/integrations/google';

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request); assertEditor(context.role);
    const body = z.object({ contentId: z.string().uuid(), publishLive: z.boolean().default(false) }).parse(await request.json());
    const content = await context.supabase.from('content_items').select('*').eq('id', body.contentId).eq('organization_id', context.organizationId).single();
    if (content.error || !content.data) throw new Response('Content item not found.', { status: 404 });
    if (content.data.status !== 'approved') throw new Response('Content must be approved before WordPress publishing.', { status: 409 });
    const approval = await context.supabase.from('approvals').select('*').eq('resource_type', 'content_item').eq('resource_id', content.data.id).eq('status', 'approved').maybeSingle();
    if (!approval.data) throw new Response('No approved publication request exists.', { status: 409 });
    const admin = serviceClient();
    const credential = await admin.from('integration_credentials').select('*').eq('organization_id', context.organizationId).eq('site_id', content.data.site_id).eq('provider', 'wordpress').single();
    if (credential.error || !credential.data) throw new Response('Connect WordPress first.', { status: 409 });
    const secrets = JSON.parse(decryptSecret(credential.data.encrypted_refresh_token)) as { username: string; applicationPassword: string };
    const wordpressUrl = String(credential.data.provider_account_data?.wordpressUrl ?? '');
    if (!wordpressUrl) throw new Response('WordPress URL is missing.', { status: 409 });
    const basic = Buffer.from(`${secrets.username}:${secrets.applicationPassword}`).toString('base64');
    const endpoint = content.data.content_type === 'blog' ? 'posts' : 'pages';
    const response = await fetch(`${wordpressUrl}/wp-json/wp/v2/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: content.data.title, content: content.data.draft, status: body.publishLive ? 'publish' : 'draft', excerpt: content.data.cta ?? undefined, meta: { _luna_target_keyword: content.data.target_keyword ?? '' } }),
      signal: AbortSignal.timeout(30000),
    });
    const payload = await response.json() as Record<string, any>;
    if (!response.ok) throw new Error(payload.message ?? `WordPress publishing failed (${response.status}).`);
    await admin.from('content_items').update({ status: body.publishLive ? 'completed' : 'approved', publication_url: payload.link ?? null, publication_date: body.publishLive ? new Date().toISOString().slice(0, 10) : null, updated_at: new Date().toISOString() }).eq('id', content.data.id);
    if (body.publishLive) await admin.from('approvals').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', approval.data.id);
    return NextResponse.json({ wordpress: { id: payload.id, link: payload.link, status: payload.status } });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: error.statusText || 'WordPress publishing failed.' }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'WordPress publishing failed.' }, { status: 400 });
  }
}
