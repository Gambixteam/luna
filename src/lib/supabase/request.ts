import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

export type RequestContext = {
  supabase: SupabaseClient;
  user: User;
  organizationId: string | null;
  role: string | null;
};

export async function authenticateRequest(request: NextRequest): Promise<RequestContext> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (!supabaseUrl || !supabaseAnonKey) throw new Response('Supabase is not configured.', { status: 503 });
  if (!token) throw new Response('Authentication required.', { status: 401 });

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Response('Invalid or expired session.', { status: 401 });

  const membership = await supabase
    .from('organization_memberships')
    .select('organization_id,role')
    .eq('user_id', data.user.id)
    .limit(1)
    .maybeSingle();

  return {
    supabase,
    user: data.user,
    organizationId: membership.data?.organization_id ?? null,
    role: membership.data?.role ?? null,
  };
}

export async function requireSite(context: RequestContext, siteId: string) {
  if (!context.organizationId) throw new Response('Complete onboarding first.', { status: 409 });
  const result = await context.supabase
    .from('sites')
    .select('*')
    .eq('id', siteId)
    .eq('organization_id', context.organizationId)
    .maybeSingle();
  if (result.error || !result.data) throw new Response('Site not found.', { status: 404 });
  return result.data;
}

export function assertEditor(role: string | null) {
  if (!role || !['owner', 'admin', 'strategist', 'contributor', 'client_admin'].includes(role)) {
    throw new Response('You do not have permission to perform this action.', { status: 403 });
  }
}
