'use client';
import { useEffect } from 'react';
import { getBrowserSupabase } from '@/lib/supabase/browser';
export default function AuthCallbackPage() {
  useEffect(() => { getBrowserSupabase().then((client) => client.auth.getSession()).finally(() => { window.location.href = '/dashboard'; }); }, []);
  return <main className="auth-page"><div className="auth-card"><h1>Signing you in…</h1><p>Luna is securing your session.</p></div></main>;
}
