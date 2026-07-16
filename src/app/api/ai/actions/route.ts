import { NextResponse } from 'next/server';

/**
 * Retired before public launch because the original prototype accepted
 * organization, site, and user IDs from the request body. Authenticated Luna
 * workflows now live under /api/luna/[action] and derive tenant identity from
 * the verified Supabase session.
 */
export function POST() {
  return NextResponse.json(
    { error: { code: 'endpoint_retired', message: 'Use the authenticated Luna workflow API.' } },
    { status: 410 },
  );
}
