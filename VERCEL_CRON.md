# Vercel Cron Jobs

Cron handlers trigger scheduled work and must not perform large workloads inside the request.

## Scheduled jobs

- Analytics synchronization.
- Search Console synchronization.
- Monthly report initiation.
- Overdue task checks.
- Access reminder checks.
- Renewal reminders.
- Usage reconciliation.
- OpenRouter budget reconciliation.

## Handler requirements

Every Cron handler must:

1. Verify `CRON_SECRET`.
2. Be idempotent.
3. Record a run ID.
4. Prevent overlapping duplicate runs.
5. Start or enqueue durable workflows instead of doing large work inline.
6. Record success, partial success, or failure.
7. Return sanitized errors only.

Unauthorized Cron requests return a safe `401` or `403` without implementation details.
