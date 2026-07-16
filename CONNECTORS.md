# Connected Service Deployment Runbook

Use the Vercel, Supabase, and Stripe connected integrations for production operations when those connector tools are available to the operator.

## Vercel connector

1. Create or select the `luna` Vercel project.
2. Connect the private GitHub repository.
3. Set the production domain to `luna.gambix.io`.
4. Import environment variables from `.env.example`, replacing placeholders with encrypted production values.
5. Deploy a preview from the current branch.
6. Promote to production only after the Supabase migration, Stripe webhook, Cron auth, and OpenRouter secrets are verified.

The repo also includes CLI-compatible scripts: `npm run deploy:preview` and `npm run deploy:production`.

## Supabase connector

1. Create or select the Luna Supabase project.
2. Apply `supabase/migrations/202607160001_luna_ai_foundation.sql`.
3. Confirm Row-Level Security is enabled for tenant and sensitive usage tables.
4. Store `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in Vercel environment variables.
5. Create initial organizations, memberships, sites, and organization budgets before testing AI actions.

The repo also includes CLI-compatible scripts: `npm run supabase:link` and `npm run supabase:db:push`.

## Stripe connector

1. Configure the Stripe webhook endpoint at `/api/stripe/webhook` for the Vercel production URL.
2. Subscribe to customer, subscription, invoice, and checkout events required by billing implementation.
3. Store `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as server-only Vercel variables.
4. Use the `stripe_events` table to deduplicate webhook processing by Stripe event ID.

The repo also includes `npm run stripe:listen` for local webhook forwarding.
