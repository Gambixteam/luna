# Luna Implementation Plan

## Architecture override

Luna is deployed and managed through Vercel and uses OpenRouter as its primary LLM routing and inference provider. Hostinger deployment instructions and a separate VPS worker are obsolete for the MVP.

## Build order

1. Establish Vercel deployment, environment, Supabase, Stripe, Blob, Cron, Workflow, Firewall, and Observability foundations.
2. Build the OpenRouter usage-control foundation before additional AI-powered features.
3. Implement Luna Credits, model tiers, presets, atomic reservations, usage ledger, circuit breakers, and rate limits.
4. Add bounded AI product workflows only; do not build unrestricted AI chat in the MVP.
5. Add admin cost-control dashboard and audit logging.
6. Complete final verification in a Vercel preview before calling architecture complete.

## Bounded MVP AI actions

Permitted actions include website-audit interpretation, local SEO audit interpretation, keyword research, competitor snapshot, draft strategy, on-page recommendations, content brief, content draft, GBP post, citation recommendations, monthly report draft, client-safe explanation, and revision of a specific approved deliverable.

Each action needs fixed purpose, validated input, maximum input size, maximum output size, credit cost, model tier, rate limit, regeneration limit, and human-review status.

## Tests to add

Add automated tests for anonymous AI requests, cross-tenant requests, inactive subscriptions, exhausted credits, daily/monthly limit exhaustion, concurrent requests, atomic reservation, failed OpenRouter requests, timeout, `402`, `403`, `429`, upstream provider failure, model fallback, cost reconciliation, idempotent retry, duplicate job submission, premium restriction, administrator override, circuit-breaker activation and recovery, secret redaction, rate-limit bypass attempts, prompt-injection attempts, and cached response accounting.

No automated test may spend real OpenRouter credits unless it is explicitly isolated in a manual integration-test suite.
