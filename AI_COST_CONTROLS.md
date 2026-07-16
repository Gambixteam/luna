# AI Cost Controls

Luna requires a Gambix AI Cost Control dashboard.

## Administrator capabilities

Authorized administrators can view total AI spend, set monthly platform budget, set plan-level limits, set organization-level limits, set user-level overrides, set feature credit costs, set model-tier mappings, pause one AI feature, pause one organization, pause all premium requests, pause all AI requests, retry a failed request, review abnormal activity, export the usage ledger, view gross-margin estimates, view OpenRouter remaining credit, and view current circuit-breaker state.

All changes must be written to the audit log.

## Request enforcement sequence

Before every OpenRouter request, Luna authenticates the request, resolves user, organization, and site, verifies access and active subscription, checks feature inclusion and account status, checks daily/monthly/per-minute/concurrent/regeneration limits, verifies model-tier permission, calculates credit charge, estimates maximum dollar cost, atomically reserves credits and estimated cost, submits a bounded OpenRouter request, captures model/provider/token/cost metadata, reconciles the reservation, records success or failure, and returns a sanitized response.

Reservations and reconciliation must be safe under concurrent requests using PostgreSQL transactions, row locks, or atomic database functions. Browser counters are never a source of truth.
