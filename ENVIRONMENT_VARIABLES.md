# Environment Variables

Store secrets as encrypted Vercel environment variables. Never expose server secrets through `NEXT_PUBLIC_` variables.

## Required

- `OPENROUTER_API_KEY`: server-only OpenRouter inference key.
- `OPENROUTER_MANAGEMENT_API_KEY`: optional admin-only key for management and usage checks.
- `OPENROUTER_SITE_URL`: site URL sent in allowed OpenRouter metadata.
- `OPENROUTER_APP_NAME`: application name sent in allowed OpenRouter metadata.
- `CRON_SECRET`: shared secret used to authenticate Vercel Cron handlers.
- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_ANON_KEY`: public Supabase anonymous key for browser-safe Supabase operations under RLS.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only Supabase service role key.
- `STRIPE_SECRET_KEY`: server-only Stripe API key.
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook verification secret.
- `NEXT_PUBLIC_APP_URL`: browser-safe canonical app URL, expected to be `https://luna.gambix.io` in production.

Use separate values for development, preview, and production. Never share one unrestricted OpenRouter key across environments.
