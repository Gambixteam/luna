'use client';

import { useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabase/browser';

type Props = { mode: 'login' | 'signup' };

const AUTH_CALLBACK_URL = 'https://luna-gambix1.vercel.app/auth/callback';

export function AuthForm({ mode }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const supabase = await getBrowserSupabase();
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: AUTH_CALLBACK_URL } });
        if (error) throw error;
        if (data.session) window.location.href = '/dashboard'; else setMessage('Check your email to confirm your Luna account. The confirmation link will return you to Luna.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = '/dashboard';
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Authentication failed.'); }
    finally { setBusy(false); }
  }

  async function google() {
    setBusy(true); setMessage('');
    try {
      const supabase = await getBrowserSupabase();
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: AUTH_CALLBACK_URL } });
      if (error) throw error;
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Google sign-in is not configured.'); setBusy(false); }
  }

  return <div className="auth-card">
    <a className="app-brand" href="/"><span className="app-brand-mark">L</span><span>Luna <small>by Gambix</small></span></a>
    <div><span className="kicker">{mode === 'login' ? 'Welcome back' : 'Founding 15 access'}</span><h1>{mode === 'login' ? 'Sign in to Luna' : 'Create your Luna account'}</h1><p>{mode === 'login' ? 'Continue managing search visibility, content, approvals and reporting.' : 'Start with a guided business intake and a real website audit.'}</p></div>
    <form onSubmit={submit} className="stack-form">
      {mode === 'signup' && <label>Full name<input required value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" /></label>}
      <label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
      <label>Password<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
      <button className="app-button" disabled={busy}>{busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
    </form>
    <button className="secondary-button" onClick={google} disabled={busy}>Continue with Google</button>
    {message && <div className="form-message">{message}</div>}
    <p className="auth-switch">{mode === 'login' ? <>New to Luna? <a href="/signup">Create an account</a></> : <>Already have an account? <a href="/login">Sign in</a></>}</p>
  </div>;
}
