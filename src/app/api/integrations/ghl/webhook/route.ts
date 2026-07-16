import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { decryptSecret, serviceClient } from '@/lib/integrations/google';

function equalSecret(received: string, expected: string) {
  const left = Buffer.from(received); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  try {
    const siteId = request.nextUrl.searchParams.get('siteId');
    const receivedSecret = request.headers.get('x-luna-webhook-secret') ?? request.nextUrl.searchParams.get('secret') ?? '';
    if (!siteId || !receivedSecret) return NextResponse.json({ error: 'Missing webhook authentication.' }, { status: 401 });
    const raw = await request.text();
    if (raw.length > 1_000_000) return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
    const payload = JSON.parse(raw) as Record<string, any>;
    const admin = serviceClient();
    const credential = await admin.from('integration_credentials').select('*').eq('site_id', siteId).eq('provider', 'gohighlevel').single();
    if (credential.error || !credential.data?.encrypted_refresh_token) return NextResponse.json({ error: 'Integration not found.' }, { status: 404 });
    if (!equalSecret(receivedSecret, decryptSecret(credential.data.encrypted_refresh_token))) return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
    const eventType = String(payload.type ?? payload.eventType ?? payload.event ?? 'unknown');
    const providerEventId = String(payload.webhookId ?? payload.id ?? payload.eventId ?? '') || null;
    const event = await admin.from('crm_events').insert({
      organization_id: credential.data.organization_id,
      site_id: siteId,
      provider: 'gohighlevel',
      provider_event_id: providerEventId,
      event_type: eventType,
      occurred_at: payload.dateAdded ?? payload.createdAt ?? payload.timestamp ?? new Date().toISOString(),
      contact_id: payload.contactId ?? payload.contact?.id ?? null,
      opportunity_id: payload.opportunityId ?? payload.opportunity?.id ?? null,
      appointment_id: payload.appointmentId ?? payload.appointment?.id ?? null,
      lead_source: payload.source ?? payload.contact?.source ?? payload.attributionSource?.source ?? null,
      value: payload.monetaryValue ?? payload.opportunity?.monetaryValue ?? null,
      payload,
    });
    if (event.error && event.error.code !== '23505') throw new Error(event.error.message);
    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Webhook failed.' }, { status: 400 });
  }
}
