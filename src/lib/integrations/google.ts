import 'server-only';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/business.manage',
];

type OAuthState = { userId: string; organizationId: string; siteId: string; expires: number; nonce: string };
type TokenPayload = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string };

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function encryptionKey() {
  const raw = required('INTEGRATION_ENCRYPTION_KEY');
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('INTEGRATION_ENCRYPTION_KEY must decode to 32 bytes.');
  return key;
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptSecret(value: string) {
  const [ivValue, tagValue, cipherValue] = value.split('.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(cipherValue, 'base64url')), decipher.final()]).toString('utf8');
}

function stateSecret() { return process.env.GOOGLE_OAUTH_STATE_SECRET ?? required('CRON_SECRET'); }

export function signOAuthState(input: Omit<OAuthState, 'expires'|'nonce'>) {
  const payload: OAuthState = { ...input, expires: Date.now() + 10 * 60 * 1000, nonce: randomBytes(16).toString('hex') };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', stateSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyOAuthState(value: string): OAuthState {
  const [encoded, supplied] = value.split('.');
  if (!encoded || !supplied) throw new Error('Invalid OAuth state.');
  const expected = createHmac('sha256', stateSecret()).update(encoded).digest();
  const actual = Buffer.from(supplied, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('OAuth state signature failed.');
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as OAuthState;
  if (payload.expires < Date.now()) throw new Error('OAuth state expired.');
  return payload;
}

export function googleAuthorizationUrl(state: string) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', required('GOOGLE_CLIENT_ID'));
  url.searchParams.set('redirect_uri', required('GOOGLE_REDIRECT_URI'));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeGoogleCode(code: string): Promise<TokenPayload> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: required('GOOGLE_CLIENT_ID'), client_secret: required('GOOGLE_CLIENT_SECRET'), redirect_uri: required('GOOGLE_REDIRECT_URI'), grant_type: 'authorization_code' }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('Google token exchange failed.');
  return response.json() as Promise<TokenPayload>;
}

export async function refreshGoogleToken(refreshToken: string): Promise<TokenPayload> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: required('GOOGLE_CLIENT_ID'), client_secret: required('GOOGLE_CLIENT_SECRET'), grant_type: 'refresh_token' }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('Google token refresh failed.');
  return response.json() as Promise<TokenPayload>;
}

export function serviceClient() {
  return createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function saveGoogleCredential(state: OAuthState, tokens: TokenPayload) {
  const supabase = serviceClient();
  const existing = await supabase.from('integration_credentials').select('*').eq('organization_id', state.organizationId).eq('site_id', state.siteId).eq('provider', 'google').maybeSingle();
  const refresh = tokens.refresh_token ? encryptSecret(tokens.refresh_token) : existing.data?.encrypted_refresh_token;
  if (!refresh) throw new Error('Google did not return a refresh token. Revoke Luna access in Google and reconnect.');
  const payload = {
    organization_id: state.organizationId, site_id: state.siteId, provider: 'google', encrypted_access_token: encryptSecret(tokens.access_token), encrypted_refresh_token: refresh,
    token_type: tokens.token_type ?? 'Bearer', scopes: (tokens.scope ?? GOOGLE_SCOPES.join(' ')).split(' '), expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(), updated_at: new Date().toISOString(),
  };
  const saved = await supabase.from('integration_credentials').upsert(payload, { onConflict: 'organization_id,site_id,provider' });
  if (saved.error) throw new Error(saved.error.message);
  await supabase.from('integrations').update({ status: 'connected', last_successful_sync: new Date().toISOString(), metadata: { googleConnected: true } }).eq('organization_id', state.organizationId).eq('site_id', state.siteId).in('provider', ['google_search_console','google_analytics_4','google_business_profile']);
}

export async function getGoogleAccessToken(organizationId: string, siteId: string) {
  const supabase = serviceClient();
  const credential = await supabase.from('integration_credentials').select('*').eq('organization_id', organizationId).eq('site_id', siteId).eq('provider', 'google').single();
  if (credential.error || !credential.data) throw new Error('Connect Google before syncing.');
  const expires = credential.data.expires_at ? new Date(credential.data.expires_at).getTime() : 0;
  if (expires > Date.now() + 60_000 && credential.data.encrypted_access_token) return decryptSecret(credential.data.encrypted_access_token);
  const refreshed = await refreshGoogleToken(decryptSecret(credential.data.encrypted_refresh_token));
  await supabase.from('integration_credentials').update({ encrypted_access_token: encryptSecret(refreshed.access_token), expires_at: new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString(), updated_at: new Date().toISOString() }).eq('id', credential.data.id);
  return refreshed.access_token;
}

export async function googleJson(url: string, accessToken: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers); headers.set('Authorization', `Bearer ${accessToken}`); headers.set('Content-Type', 'application/json');
  const response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(30000), cache: 'no-store' });
  if (!response.ok) throw new Error(`Google API request failed (${response.status}).`);
  return response.json() as Promise<Record<string, any>>;
}
