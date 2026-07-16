import { NextResponse, type NextRequest } from 'next/server';
import { authenticateRequest, requireSite } from '@/lib/supabase/request';
import { googleAuthorizationUrl, signOAuthState } from '@/lib/integrations/google';
import { z } from 'zod';

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const body = z.object({ siteId: z.string().uuid() }).parse(await request.json());
    const site = await requireSite(context, body.siteId);
    const state = signOAuthState({ userId: context.user.id, organizationId: context.organizationId!, siteId: site.id });
    return NextResponse.json({ authorizationUrl: googleAuthorizationUrl(state) });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: error.statusText || 'Unable to connect Google.' }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to connect Google.' }, { status: 400 });
  }
}
