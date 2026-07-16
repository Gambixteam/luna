# AI Incident Response

## Triggers

Incidents include OpenRouter budget thresholds, exhausted provider credit, elevated `402`, `403`, or `429` responses, upstream provider failures, abnormal usage, suspected secret exposure, failed reconciliation, and tenant-isolation anomalies.

## Response

1. Pause affected AI features or all AI requests if needed.
2. Preserve non-AI Luna functionality.
3. Notify Gambix administrators.
4. Inspect Vercel Observability logs and traces with secret redaction confirmed.
5. Review usage ledger, reservations, cost ledger, and circuit-breaker state.
6. Reconcile or refund failed reservations.
7. Rotate OpenRouter keys if exposure is suspected.
8. Record timeline, impact, remediation, and follow-up tests.

User-facing messages must be neutral and must not reveal provider internals or secrets.
