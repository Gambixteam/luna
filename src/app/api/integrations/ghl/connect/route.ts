import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { authenticateRequest, assertEditor, requireSite } from '@/lib/supabase/request';
import { encryptSecret, serviceClient } from '@/lib/integrations/google';

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request); assertEditor(context.role);
    const body = z.object({ siteId: z.string().uuid(), locationId: z.string().min(5).max(100), privateIntegrationToken: z.string().min(20).max(3000) }).parse(await request.json());
    const site = await requireSite(context, body.siteId);
    const response = await fetch(`https://services.leadconnectorhq.com/locations/${encodeURIComponent(body.locationId)}`, {
      headers: { Authorization: `Bearer ${body.privateIntegrationToken}`, Accept: 'application/json', Version: '2021-07-28' },
      signal: AbortSignal.timeout(15000), cache: 'no-store',
    });
    const payload = await response.json() as Record<string, any>;
    if (!response.ok) throw new Error(payload.message ?? `HighLevel rejected the credentials (${response.status}).`);
    const webhookSecret = randomBytes(32).toString('hex');
    const admin = serviceClient();
    const saved = await admin.from('integration_credentials').upsert({ organization_id: context.organizationId, site_id: site.id, provider: 'gohighlevel', encrypted_access_token: encryptSecret(body.privateIntegrationToken), encrypted_refresh_token: encryptSecret(webhookSecret), provider_account_data: { locationId: body.locationId, locationName: payload.location?.name ?? payload.name ?? null }, updated_at: new Date().toISOString() }, { onConflict: 'organization_id,site_id,provider' });
    if (saved.error) throw new Error(saved.error.message);
    await admin.from('integrations').upsert({ organization_id: context.organizationId, site_id: site.id, provider: 'gohighlevel', status: 'connected', external_account_id: body.locationId, metadata: { locationId: body.locationId, locationName: payload.location?.name ?? payload.name ?? null }, last_successful_sync: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'organization_id,site_id,provider' });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
    return NextResponse.json({ connected: true, location: payload.location ?? payload, webhookUrl: `${appUrl}/api/integrations/ghl/webhook?siteId=${site.id}`, webhookSecret });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: error.statusText || 'HighLevel connection failed.' }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'HighLevel connection failed.' }, { status: 400 });
  }
}
