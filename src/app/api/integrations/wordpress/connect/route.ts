import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateRequest, assertEditor, requireSite } from '@/lib/supabase/request';
import { encryptSecret, serviceClient } from '@/lib/integrations/google';

function normalizeWordPressUrl(value: string) {
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  if (url.protocol !== 'https:') throw new Error('WordPress connections must use HTTPS.');
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?)/i.test(url.hostname)) throw new Error('Private network WordPress sites are not supported.');
  return url.origin;
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request); assertEditor(context.role);
    const body = z.object({ siteId: z.string().uuid(), wordpressUrl: z.string().min(3).max(500), username: z.string().min(1).max(200), applicationPassword: z.string().min(8).max(500) }).parse(await request.json());
    const site = await requireSite(context, body.siteId);
    const wordpressUrl = normalizeWordPressUrl(body.wordpressUrl);
    const basic = Buffer.from(`${body.username}:${body.applicationPassword}`).toString('base64');
    const response = await fetch(`${wordpressUrl}/wp-json/wp/v2/users/me?context=edit`, { headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15000), cache: 'no-store' });
    if (!response.ok) throw new Error(`WordPress rejected the credentials (${response.status}). Create an application password for an editor or administrator.`);
    const user = await response.json() as Record<string, unknown>;
    const admin = serviceClient();
    const credential = await admin.from('integration_credentials').upsert({ organization_id: context.organizationId, site_id: site.id, provider: 'wordpress', encrypted_refresh_token: encryptSecret(JSON.stringify({ username: body.username, applicationPassword: body.applicationPassword })), provider_account_data: { wordpressUrl, userId: user.id, userName: user.name }, updated_at: new Date().toISOString() }, { onConflict: 'organization_id,site_id,provider' });
    if (credential.error) throw new Error(credential.error.message);
    await admin.from('integrations').upsert({ organization_id: context.organizationId, site_id: site.id, provider: 'wordpress', status: 'connected', external_account_id: String(user.id ?? ''), metadata: { wordpressUrl, userName: user.name }, last_successful_sync: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'organization_id,site_id,provider' });
    return NextResponse.json({ connected: true, wordpressUrl, user: { id: user.id, name: user.name } });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: error.statusText || 'WordPress connection failed.' }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'WordPress connection failed.' }, { status: 400 });
  }
}
