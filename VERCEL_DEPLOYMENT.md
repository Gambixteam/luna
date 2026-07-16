# Luna Vercel Deployment Architecture

Luna deploys to Vercel at `luna.gambix.io`. The Gambix marketing site remains at `gambix.io`. Hostinger and a separate VPS worker are obsolete for the MVP.

## Platform

- Next.js App Router, TypeScript, React, Vercel Functions, Fluid Compute where request duration or streaming needs justify it.
- Vercel Workflow for durable multi-step pipelines, human approvals, retries, and failure resumption.
- Vercel Cron Jobs for scheduled triggers that enqueue workflows instead of doing large workloads inline.
- Vercel Firewall for network abuse protection.
- Vercel Observability for logs, traces, performance monitoring, and incident triage.
- Vercel Blob for uploads and generated report assets; use Supabase Storage only where Vercel Blob is not appropriate.
- Supabase PostgreSQL, Supabase Auth, Row-Level Security, and Stripe billing.

## Project creation

1. Create a Vercel project named `luna`.
2. Connect the private GitHub repository.
3. Set the framework preset to Next.js.
4. Configure production domain `luna.gambix.io`.
5. Keep `gambix.io` pointed at the marketing website project.

## Deployments

- Preview deployments run for pull requests and non-production branches with preview Supabase, Stripe, and OpenRouter keys.
- Production deployments run only from the production branch after review.
- Rollbacks use Vercel's deployment rollback to a known-good production deployment, followed by database migration rollback only when required and explicitly approved.

## Required integrations

- Supabase: configure Auth redirect URLs for preview and production domains, enable RLS on tenant tables, and store service role keys only as server-side Vercel environment variables.
- Stripe: configure webhook endpoint in a Vercel Function and store webhook secrets per environment.
- OpenRouter: configure separate development, preview, and production keys; production keys must have OpenRouter credit limits.
- Blob: configure generated report assets and uploaded files to use Vercel Blob by default.

## Environment variables

Use encrypted Vercel environment variables. Server secrets must never use the `NEXT_PUBLIC_` prefix. See `ENVIRONMENT_VARIABLES.md`.

## Final verification gate

Architecture is not complete until a Vercel preview confirms authentication, tenant isolation, allowed AI action success, usage recording, cost reconciliation, exhausted-account blocking, duplicate-request idempotency, premium restrictions, browser secret absence, Cron authentication, Workflow failure resumption, log redaction, OpenRouter circuit breakers, and non-AI behavior while AI is paused.
