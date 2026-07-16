# Vercel Workflows

Use Vercel Workflow for durable operations that need retries, multi-stage integrations, human approval pauses, or longer execution than a single request.

## MVP workflow candidates

- Client onboarding pipelines.
- Website audit pipelines.
- Keyword research pipelines.
- Competitor snapshots.
- Initial strategy generation.
- Content production workflows.
- Monthly report generation.
- Approval-gated revisions and deliverables.

## Rules

- Workflow starts must be authenticated and authorized through ordinary Vercel Functions.
- Each workflow receives organization, site, user, feature, and idempotency context.
- Expensive AI steps call only the centralized Luna AI service described in `OPENROUTER.md`.
- Failed workflows record safe error classifications and may be retried without duplicate credit charges.
- Human approval checkpoints must validate the approver server-side before resuming.
- Queue operations must be abstracted behind an interface so Vercel Queues, Upstash QStash, or another durable queue can be adopted later.

## No MVP dependency on Vercel Queues

Do not make core MVP functionality depend on Vercel Queues unless production readiness and account availability are confirmed during implementation.
