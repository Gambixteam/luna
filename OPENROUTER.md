# OpenRouter Integration

Luna uses OpenRouter as the primary LLM routing and inference provider. Do not use Vercel AI Gateway for production inference unless Gambix explicitly enables it as a fallback later.

## Packages

Install and use the current stable versions of:

- `ai`
- `@ai-sdk/react`
- `@openrouter/ai-sdk-provider`

Verify current stable package versions during implementation before installation.

## Central service only

Create one server-only OpenRouter provider module using the Vercel AI SDK provider adapter. No application module may call OpenRouter directly. All AI requests pass through a controlled Luna AI service with a request shape equivalent to:

```ts
interface LunaAIRequest {
  organizationId: string;
  siteId: string;
  userId: string;
  feature: LunaAIFeature;
  preset: string;
  requestedModelTier: LunaModelTier;
  input: unknown;
  maximumOutputTokens: number;
  idempotencyKey: string;
}
```

## Secrets

`OPENROUTER_API_KEY` exists only on the server in encrypted Vercel environment variables. It must never be exposed through `NEXT_PUBLIC_`, sent to the browser, written to client logs, returned in errors, or emitted in analytics events.

## Presets

OpenRouter presets manage model and provider configuration separately from application code. Required preset names:

- `luna-fast-classification`
- `luna-page-analysis`
- `luna-keyword-research`
- `luna-competitor-analysis`
- `luna-strategy`
- `luna-content-brief`
- `luna-content-draft`
- `luna-gbp-post`
- `luna-report`
- `luna-quality-control`

Feature-to-preset mappings live in the database or server configuration. Ordinary customers cannot select arbitrary models.

## Model tiers

- Economy: classification, extraction, summarization, metadata checks, keyword grouping, simple page analysis, formatting, and report-section cleanup.
- Standard: content briefs, competitor summaries, local SEO recommendations, on-page recommendations, GBP post drafts, and content refreshes.
- Premium: initial strategy generation, difficult competitive analysis, final report synthesis, high-value content planning, and quality control on important deliverables.

Premium models require explicit permission or administrator approval and must not be used for tasks reliably handled by economy or standard models. Model mappings must be changeable without deploying code.

## Request controls

Use price-based provider routing where quality permits, explicit approved fallbacks, supported maximum-price controls, required structured-output parameter support, and Zero Data Retention routing where available and appropriate. Do not route private client data through providers that violate the configured data policy.

## Circuit breakers

Use separate OpenRouter keys for development, preview, and production. Production must have an OpenRouter credit limit. Periodically query key usage and record remaining credit plus daily, weekly, and monthly usage.

Alerts fire at 50%, 75%, 90%, and 100% of application budget. At 90%, disable nonessential premium requests, route eligible tasks to economy models, and notify administrators. At 100%, safely block new AI requests while preserving unrelated Luna functionality and notifying administrators immediately.
