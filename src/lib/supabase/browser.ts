'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let clientPromise: Promise<SupabaseClient> | null = null;

export function getBrowserSupabase(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = fetch('/api/config', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Luna authentication is not configured.');
        return response.json() as Promise<{ supabaseUrl: string; supabaseAnonKey: string }>;
      })
      .then(({ supabaseUrl, supabaseAnonKey }) =>
        createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        }),
      );
  }
  return clientPromise;
}

export async function authorizedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const supabase = await getBrowserSupabase();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session expired. Sign in again.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(input, { ...init, headers });
}
