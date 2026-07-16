# AI Usage Ledger

Every inference request records organization ID, site ID, user ID, subscription ID, plan, feature, workflow ID, OpenRouter preset, requested model tier, actual model, actual provider when available, input tokens, output tokens, reasoning tokens when available, cached tokens when available, estimated cost, actual cost, Luna Credits charged, OpenRouter generation ID, request status, error classification, created date, completion date, and idempotency key.

## Customer visibility

Customers may see Luna Credits used, remaining credits, reset date, and recent AI actions. Customers must not see Gambix OpenRouter keys, provider secrets, gross-margin internals, other clients' usage, or internal system prompts.

## Administrator visibility

Administrators must see usage by organization, site, feature, user, model, and provider; daily and monthly cost; revenue-to-AI-cost ratio; accounts approaching limits; failed requests; abnormal usage; cache hit rate; and premium-model usage.
