# Luna Credits

Luna hides raw token accounting from customers. Every AI-enabled feature has a configurable Luna Credit cost.

## Required tables

Create tables equivalent to `ai_features`, `ai_model_tiers`, `ai_presets`, `plan_ai_entitlements`, `organization_ai_budgets`, `user_ai_limits`, `ai_usage_reservations`, `ai_usage_events`, `ai_cost_ledger`, `ai_limit_overrides`, and `ai_budget_alerts`.

## Entitlement controls

Each plan entitlement supports monthly credits, daily credits, requests per minute, requests per hour, concurrent AI jobs, maximum output tokens per feature, maximum input size, pages per audit, competitors per snapshot, regenerations per deliverable, premium access, feature access, overage behavior, and reset date.

Supported overage behaviors are hard block, require Gambix approval, purchased credit pack, metered overage, and temporary administrator override. MVP default is hard block.

## Plans

Plan definitions must be administrator-editable without code changes: Founding 15 Pilot, Luna Core, Luna Plus, and Luna Scale. Seed sensible test values only and mark them configurable.
