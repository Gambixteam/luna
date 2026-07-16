# Luna Supabase migration inventory

Production Supabase project: `agbqssuutqtzmdcqhjyk`

The following migrations were applied through the Supabase migration API on July 16, 2026:

1. `20260716212827_luna_profiles_plans_orgs`
2. `20260716212839_luna_business_and_onboarding`
3. `20260716212852_luna_audits_and_research`
4. `20260716212906_luna_strategy_content_visibility`
5. `20260716212923_luna_operations_and_reporting`
6. `20260716212930_luna_auth_helpers`
7. `20260716212938_luna_create_org_rpc`
8. `20260716212946_luna_profile_trigger`
9. `20260716212958_luna_core_rls`
10. `20260716213011_luna_research_rls`
11. `20260716213027_luna_execution_rls`
12. `20260716214716_luna_security_hardening`
13. `20260716214940_luna_integration_credentials`
14. `20260716215857_luna_reputation_and_delivery`
15. `20260716220203_luna_crm_events`
16. `20260716220300_luna_stripe_events`
17. `20260716220658_luna_lock_initial_plan`
18. `20260716221005_luna_rls_performance`

## Current schema contract

The production project contains 31 public application tables with Row Level Security enabled. Sensitive tables such as `integration_credentials` and `stripe_events` have no authenticated-client policies and are accessible only through server-side service-role workflows.

## Required release checks

Before creating a new Supabase environment:

- Recreate the schema from the authoritative migration history in the Supabase project.
- Generate current TypeScript types with `supabase gen types typescript` or the Supabase type generator.
- Run the security and performance advisors.
- Confirm all tenant-owned tables have RLS enabled.
- Confirm initial organization creation always assigns the `founding_15` plan.
- Confirm the private `luna-client-files` bucket and tenant folder policies exist.

This file records the production migration sequence. It does not replace the Supabase migration ledger.