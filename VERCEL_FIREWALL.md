# Vercel Firewall

Use Vercel Firewall for broad network-level protection, but never rely on IP limits alone for authenticated Luna feature limits.

## Firewall protections

- Block obvious automated abuse and malicious traffic patterns.
- Protect internal workflow and Cron endpoints from direct external abuse.
- Apply stricter rules to authentication, billing webhook, Cron, and AI request submission paths.
- Keep allowlists minimal and documented.

## Application limits still required

Application-level distributed rate limits must enforce limits by IP, user, organization, site, feature, and subscription plan. Shared customer networks mean IP-only controls are insufficient.
