create extension if not exists pgcrypto;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_status text not null default 'active' check (account_status in ('active','paused','blocked')),
  created_at timestamptz not null default now()
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, domain)
);

create table public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner','admin','member','viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.ai_model_tiers (
  key text primary key,
  name text not null,
  premium boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.ai_presets (
  key text primary key,
  model_tier text not null references public.ai_model_tiers(key),
  maximum_output_tokens integer not null check (maximum_output_tokens > 0),
  max_price_usd numeric(12,6) not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.ai_features (
  key text primary key,
  preset_key text not null references public.ai_presets(key),
  model_tier text not null references public.ai_model_tiers(key),
  luna_credit_cost integer not null check (luna_credit_cost >= 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.plan_ai_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null unique,
  monthly_luna_credits integer not null,
  daily_luna_credits integer not null,
  requests_per_minute integer not null,
  requests_per_hour integer not null,
  max_concurrent_ai_jobs integer not null,
  maximum_output_tokens_per_feature integer not null,
  maximum_input_size integer not null,
  maximum_website_pages_per_audit integer not null,
  maximum_competitors_per_snapshot integer not null,
  maximum_regenerations_per_deliverable integer not null,
  premium_model_access boolean not null default false,
  feature_access jsonb not null default '{}'::jsonb,
  overage_behavior text not null default 'hard_block' check (overage_behavior in ('hard_block','gambix_approval','credit_pack','metered_overage','admin_override')),
  reset_day integer not null default 1 check (reset_day between 1 and 28),
  created_at timestamptz not null default now()
);

create table public.organization_ai_budgets (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  plan_key text not null references public.plan_ai_entitlements(plan_key),
  subscription_status text not null default 'active' check (subscription_status in ('active','trialing','past_due','canceled','paused')),
  monthly_luna_credits_remaining integer not null default 0,
  daily_luna_credits_remaining integer not null default 0,
  monthly_budget_usd numeric(12,6) not null default 0,
  ai_paused boolean not null default false,
  premium_paused boolean not null default false,
  reset_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_ai_limits (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  daily_luna_credits_remaining integer,
  requests_per_hour integer,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.ai_usage_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  user_id uuid not null,
  feature_key text not null references public.ai_features(key),
  preset_key text not null references public.ai_presets(key),
  requested_model_tier text not null references public.ai_model_tiers(key),
  luna_credits_reserved integer not null,
  estimated_cost_usd numeric(12,6) not null,
  status text not null default 'reserved' check (status in ('reserved','succeeded','failed','refunded')),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (organization_id, idempotency_key)
);

create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.ai_usage_reservations(id) on delete cascade,
  organization_id uuid not null,
  site_id uuid not null,
  user_id uuid not null,
  plan_key text not null,
  feature_key text not null,
  workflow_id text,
  openrouter_preset text not null,
  requested_model_tier text not null,
  actual_model text,
  actual_provider text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  reasoning_tokens integer not null default 0,
  cached_tokens integer not null default 0,
  estimated_cost_usd numeric(12,6) not null,
  actual_cost_usd numeric(12,6) not null default 0,
  luna_credits_charged integer not null,
  openrouter_generation_id text,
  request_status text not null,
  error_classification text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.ai_cost_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  usage_event_id uuid references public.ai_usage_events(id) on delete set null,
  amount_usd numeric(12,6) not null,
  ledger_type text not null check (ledger_type in ('reservation','actual','refund','adjustment')),
  created_at timestamptz not null default now()
);

create table public.ai_limit_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid,
  feature_key text references public.ai_features(key),
  override jsonb not null,
  reason text not null,
  expires_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table public.ai_budget_alerts (
  id uuid primary key default gen_random_uuid(),
  threshold_percent integer not null check (threshold_percent in (50,75,90,100)),
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  observed_usage_usd numeric(12,6) not null,
  created_at timestamptz not null default now()
);

create table public.cron_runs (
  id uuid primary key,
  job_key text not null,
  status text not null check (status in ('success','partial_success','failure')),
  created_at timestamptz not null default now()
);


create table public.stripe_customers (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stripe_subscription_id text unique,
  plan_key text not null references public.plan_ai_entitlements(plan_key),
  status text not null check (status in ('trialing','active','past_due','canceled','unpaid','paused')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stripe_events (
  id text primary key,
  event_type text not null,
  livemode boolean not null,
  payload jsonb not null,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;
alter table public.sites enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.ai_usage_reservations enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.stripe_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.stripe_events enable row level security;

insert into public.ai_model_tiers (key, name, premium) values
  ('economy','Economy',false), ('standard','Standard',false), ('premium','Premium',true);

insert into public.ai_presets (key, model_tier, maximum_output_tokens, max_price_usd) values
  ('luna-fast-classification','economy',1000,0.02), ('luna-page-analysis','economy',1800,0.05),
  ('luna-keyword-research','standard',2200,0.10), ('luna-competitor-analysis','standard',2400,0.12),
  ('luna-strategy','premium',3500,0.30), ('luna-content-brief','standard',2200,0.12),
  ('luna-content-draft','standard',3800,0.18), ('luna-gbp-post','standard',1000,0.05),
  ('luna-report','premium',3200,0.28), ('luna-quality-control','standard',1800,0.10);

insert into public.ai_features (key, preset_key, model_tier, luna_credit_cost) values
  ('website_audit_interpretation','luna-page-analysis','economy',2), ('local_seo_audit_interpretation','luna-page-analysis','economy',2),
  ('keyword_research','luna-keyword-research','standard',5), ('competitor_snapshot','luna-competitor-analysis','standard',6),
  ('draft_strategy','luna-strategy','premium',12), ('on_page_recommendations','luna-page-analysis','standard',4),
  ('content_brief','luna-content-brief','standard',5), ('content_draft','luna-content-draft','standard',8),
  ('gbp_post','luna-gbp-post','standard',3), ('citation_recommendations','luna-fast-classification','economy',2),
  ('monthly_report_draft','luna-report','premium',10), ('client_safe_explanation','luna-fast-classification','economy',1),
  ('approved_deliverable_revision','luna-quality-control','standard',4);

insert into public.plan_ai_entitlements (plan_key, monthly_luna_credits, daily_luna_credits, requests_per_minute, requests_per_hour, max_concurrent_ai_jobs, maximum_output_tokens_per_feature, maximum_input_size, maximum_website_pages_per_audit, maximum_competitors_per_snapshot, maximum_regenerations_per_deliverable, premium_model_access) values
  ('founding_15_pilot',100,20,5,30,2,3500,50000,50,3,2,true),
  ('luna_core',60,10,3,20,1,2200,25000,25,2,1,false),
  ('luna_plus',160,30,6,60,3,3500,75000,75,4,3,true),
  ('luna_scale',400,80,10,120,5,4000,150000,150,8,5,true);

create or replace function public.reserve_ai_usage(
  p_organization_id uuid, p_site_id uuid, p_user_id uuid, p_feature_key text, p_preset_key text,
  p_requested_model_tier text, p_luna_credits integer, p_estimated_cost_usd numeric, p_idempotency_key text
) returns uuid language plpgsql security definer as $$
declare v_budget public.organization_ai_budgets%rowtype; v_reservation_id uuid;
begin
  select * into v_budget from public.organization_ai_budgets where organization_id = p_organization_id for update;
  if not found or v_budget.subscription_status not in ('active','trialing') or v_budget.ai_paused then raise exception 'ai_unavailable'; end if;
  if v_budget.daily_luna_credits_remaining < p_luna_credits or v_budget.monthly_luna_credits_remaining < p_luna_credits then raise exception 'credits_exhausted'; end if;
  insert into public.ai_usage_reservations (organization_id, site_id, user_id, feature_key, preset_key, requested_model_tier, luna_credits_reserved, estimated_cost_usd, idempotency_key)
  values (p_organization_id, p_site_id, p_user_id, p_feature_key, p_preset_key, p_requested_model_tier, p_luna_credits, p_estimated_cost_usd, p_idempotency_key)
  on conflict (organization_id, idempotency_key) do nothing
  returning id into v_reservation_id;
  if v_reservation_id is null then
    select id into v_reservation_id from public.ai_usage_reservations where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
    return v_reservation_id;
  end if;
  update public.organization_ai_budgets set daily_luna_credits_remaining = daily_luna_credits_remaining - p_luna_credits, monthly_luna_credits_remaining = monthly_luna_credits_remaining - p_luna_credits, updated_at = now() where organization_id = p_organization_id;
  return v_reservation_id;
end $$;

create or replace function public.reconcile_ai_usage_success(
  p_reservation_id uuid, p_actual_model text, p_actual_provider text, p_input_tokens integer, p_output_tokens integer, p_actual_cost_usd numeric, p_openrouter_generation_id text
) returns uuid language plpgsql security definer as $$
declare v_res public.ai_usage_reservations%rowtype; v_budget public.organization_ai_budgets%rowtype; v_event_id uuid;
begin
  select * into v_res from public.ai_usage_reservations where id = p_reservation_id for update;
  if not found then raise exception 'reservation_not_found'; end if;
  select * into v_budget from public.organization_ai_budgets where organization_id = v_res.organization_id;
  update public.ai_usage_reservations set status='succeeded', completed_at=now() where id=p_reservation_id;
  insert into public.ai_usage_events (reservation_id, organization_id, site_id, user_id, plan_key, feature_key, openrouter_preset, requested_model_tier, actual_model, actual_provider, input_tokens, output_tokens, estimated_cost_usd, actual_cost_usd, luna_credits_charged, openrouter_generation_id, request_status, idempotency_key, completed_at)
  values (v_res.id, v_res.organization_id, v_res.site_id, v_res.user_id, v_budget.plan_key, v_res.feature_key, v_res.preset_key, v_res.requested_model_tier, p_actual_model, p_actual_provider, p_input_tokens, p_output_tokens, v_res.estimated_cost_usd, p_actual_cost_usd, v_res.luna_credits_reserved, p_openrouter_generation_id, 'succeeded', v_res.idempotency_key, now()) returning id into v_event_id;
  insert into public.ai_cost_ledger (organization_id, usage_event_id, amount_usd, ledger_type) values (v_res.organization_id, v_event_id, p_actual_cost_usd, 'actual');
  return v_event_id;
end $$;

create or replace function public.reconcile_ai_usage_failure(p_reservation_id uuid, p_error_classification text) returns uuid language plpgsql security definer as $$
declare v_res public.ai_usage_reservations%rowtype; v_budget public.organization_ai_budgets%rowtype; v_event_id uuid;
begin
  select * into v_res from public.ai_usage_reservations where id = p_reservation_id for update;
  if not found then raise exception 'reservation_not_found'; end if;
  select * into v_budget from public.organization_ai_budgets where organization_id = v_res.organization_id for update;
  update public.ai_usage_reservations set status='failed', completed_at=now() where id=p_reservation_id;
  update public.organization_ai_budgets set daily_luna_credits_remaining = daily_luna_credits_remaining + v_res.luna_credits_reserved, monthly_luna_credits_remaining = monthly_luna_credits_remaining + v_res.luna_credits_reserved, updated_at=now() where organization_id=v_res.organization_id;
  insert into public.ai_usage_events (reservation_id, organization_id, site_id, user_id, plan_key, feature_key, openrouter_preset, requested_model_tier, estimated_cost_usd, actual_cost_usd, luna_credits_charged, request_status, error_classification, idempotency_key, completed_at)
  values (v_res.id, v_res.organization_id, v_res.site_id, v_res.user_id, v_budget.plan_key, v_res.feature_key, v_res.preset_key, v_res.requested_model_tier, v_res.estimated_cost_usd, 0, 0, 'failed', p_error_classification, v_res.idempotency_key, now()) returning id into v_event_id;
  insert into public.ai_cost_ledger (organization_id, usage_event_id, amount_usd, ledger_type) values (v_res.organization_id, v_event_id, v_res.estimated_cost_usd, 'refund');
  return v_event_id;
end $$;
