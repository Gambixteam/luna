# Rate Limiting and Duplicate Prevention

Implement server-side limits by IP, user, organization, site, feature, and subscription plan. Authenticated feature limits require an application-level distributed rate limiter. Vercel Firewall supplies broad abuse protection only.

## Responses

Return standard `429 Too Many Requests` responses with safe error code, reset time, and remaining allowance when appropriate. Do not include internal implementation details.

## Bypass prevention

Use idempotency keys and server-side authorization to prevent bypasses from multiple tabs, resubmitted forms, replayed API requests, duplicate jobs, client-supplied model names, manipulated credit values, internal workflow endpoint calls, and direct approval callback calls.

## Caching

Use OpenRouter response caching only for deterministic safe requests such as classification, repeated fixtures, identical static page analysis, stable metadata extraction, and development tests. Avoid long-lived caching for current analytics, current competitor analysis, monthly reporting, private user-specific responses that can become stale, and freshness-sensitive requests.

Use Luna-level caching for crawl results, PageSpeed results, analytics syncs, Search Console data, keyword datasets, competitor snapshots, and generated reports. Use content hashes to detect changed pages, datasets, prompt inputs, strategy inputs, and report regeneration needs.
