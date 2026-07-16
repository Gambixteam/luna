import { NextResponse, type NextRequest } from 'next/server';
import { exchangeGoogleCode, saveGoogleCredential, verifyOAuthState } from '@/lib/integrations/google';

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  try {
    const code = request.nextUrl.searchParams.get('code');
    const stateValue = request.nextUrl.searchParams.get('state');
    const denied = request.nextUrl.searchParams.get('error');
    if (denied) return NextResponse.redirect(new URL(`/dashboard?google=denied`, appUrl));
    if (!code || !stateValue) throw new Error('Google did not return an authorization code.');
    const state = verifyOAuthState(stateValue);
    const tokens = await exchangeGoogleCode(code);
    await saveGoogleCredential(state, tokens);
    return NextResponse.redirect(new URL('/dashboard?google=connected', appUrl));
  } catch (error) {
    const message = encodeURIComponent(error instanceof Error ? error.message : 'Google connection failed.');
    return NextResponse.redirect(new URL(`/dashboard?google=error&message=${message}`, appUrl));
  }
}
