'use client';

import { useEffect, useState } from 'react';
import type { EmailOtpType } from '@supabase/supabase-js';
import { getBrowserSupabase } from '@/lib/supabase/browser';

function getAuthError() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return query.get('error_description') ?? query.get('error') ?? hash.get('error_description') ?? hash.get('error');
}

export default function AuthCallbackPage() {
  const [message, setMessage] = useState('Luna is confirming your email and securing your session.');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    async function completeAuthentication() {
      const authError = getAuthError();
      if (authError) throw new Error(authError);

      const client = await getBrowserSupabase();
      const query = new URLSearchParams(window.location.search);

      let sessionResult = await client.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;

      if (!sessionResult.data.session) {
        const code = query.get('code');
        const tokenHash = query.get('token_hash');
        const type = query.get('type') as EmailOtpType | null;

        if (code) {
          const exchanged = await client.auth.exchangeCodeForSession(code);
          if (exchanged.error) throw exchanged.error;
        } else if (tokenHash && type) {
          const verified = await client.auth.verifyOtp({ token_hash: tokenHash, type });
          if (verified.error) throw verified.error;
        }

        sessionResult = await client.auth.getSession();
        if (sessionResult.error) throw sessionResult.error;
      }

      if (!sessionResult.data.session) {
        throw new Error('Your email may be confirmed, but Luna could not create a browser session. Sign in with the email and password you just created.');
      }

      window.history.replaceState({}, '', '/auth/callback');
      window.location.replace('/dashboard');
    }

    completeAuthentication().catch((error) => {
      if (!active) return;
      setFailed(true);
      setMessage(error instanceof Error ? error.message : 'Luna could not complete your sign-in.');
    });

    return () => { active = false; };
  }, []);

  return <main className="auth-page"><div className="auth-card">
    <a className="app-brand" href="/"><span className="app-brand-mark">L</span><span>Luna <small>by Gambix</small></span></a>
    <h1>{failed ? 'Email confirmed—finish signing in' : 'Signing you in…'}</h1>
    <p>{message}</p>
    {failed && <div className="button-row"><a className="app-button" href="/login">Go to sign in</a><a className="secondary-button" href="/signup">Create a different account</a></div>}
  </div></main>;
}
