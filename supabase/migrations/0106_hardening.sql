-- Phase 17 hardening (TASKS T17.2, T17.4): a Postgres token bucket for expensive endpoints,
-- covering indexes for the foreign keys the advisor flagged, and explicit deny policies on
-- server-only tables so "RLS on, no policy" is a stated decision rather than an omission.

-- Token bucket -------------------------------------------------------------------------------------
-- One row per (bucket, subject). Tokens refill continuously at refill_per_s up to capacity.
create table internal.rate_limit_buckets (
  bucket text not null check (bucket ~ '^[a-z][a-z0-9_]{0,39}$'),
  subject text not null check (length(subject) between 1 and 200),
  tokens double precision not null check (tokens >= 0),
  updated_at timestamptz not null default now(),
  primary key (bucket, subject)
);
create index rate_limit_buckets_updated_idx on internal.rate_limit_buckets (updated_at);
alter table internal.rate_limit_buckets enable row level security;
revoke all on internal.rate_limit_buckets from public, anon, authenticated;

-- Takes p_cost tokens if available. The row lock serializes concurrent callers on one subject.
create or replace function public.srv_take_rate_token(
  p_bucket text,
  p_subject text,
  p_capacity integer,
  p_refill_per_s double precision,
  p_cost integer default 1
) returns table (allowed boolean, remaining integer, retry_after_ms integer)
language plpgsql security definer set search_path = '' as $$
declare
  have double precision;
  last_at timestamptz;
begin
  if p_capacity < 1 or p_refill_per_s <= 0 or p_cost < 1 or p_cost > p_capacity then
    raise exception 'invalid rate limit' using errcode = '22023';
  end if;
  insert into internal.rate_limit_buckets (bucket, subject, tokens, updated_at)
  values (p_bucket, p_subject, p_capacity, now())
  on conflict (bucket, subject) do nothing;
  select b.tokens, b.updated_at into have, last_at
  from internal.rate_limit_buckets b
  where b.bucket = p_bucket and b.subject = p_subject
  for update;
  have := least(p_capacity::double precision,
    have + greatest(0, extract(epoch from now() - last_at)) * p_refill_per_s);
  allowed := have >= p_cost;
  if allowed then
    have := have - p_cost;
  end if;
  update internal.rate_limit_buckets b set tokens = have, updated_at = now()
  where b.bucket = p_bucket and b.subject = p_subject;
  remaining := floor(have)::integer;
  retry_after_ms := case when allowed then 0
    else ceil((p_cost - have) / p_refill_per_s * 1000)::integer end;
  return next;
end $$;
revoke all on function public.srv_take_rate_token(text, text, integer, double precision, integer)
  from public, anon, authenticated;
grant execute on function public.srv_take_rate_token(text, text, integer, double precision, integer)
  to service_role;

-- A full bucket is the same as no row, so idle rows can go.
select cron.schedule('rate-limit-gc', '41 * * * *',
  $$delete from internal.rate_limit_buckets where updated_at < now() - interval '1 day'$$);

-- Covering indexes for foreign keys (advisor: unindexed_foreign_keys) ------------------------------
create index consent_diffs_reproof_report_idx on public.consent_diffs (reproof_report_id);
create index consent_diffs_snapshot_idx on public.consent_diffs (snapshot_id);
create index contract_versions_basket_idx on public.contract_versions (basket_id);
create index contract_versions_contract_plan_idx on public.contract_versions (contract_id, plan_id);
create index contract_versions_proof_report_idx on public.contract_versions (proof_report_id);
create index facts_superseded_by_idx on public.facts (superseded_by);
create index payment_executions_instrument_idx on public.payment_executions (instrument_id);
create index signing_challenges_user_idx on public.signing_challenges (user_id);
create index payment_grant_uses_session_idx on greathub.payment_grant_uses (session_id);

-- Server-only tables: deny client roles explicitly (advisor: rls_enabled_no_policy) ------------------
do $$
declare t regclass;
begin
  for t in
    select c.oid::regclass from pg_class c
    where c.relkind = 'r' and c.relrowsecurity
      and c.relnamespace in ('public'::regnamespace, 'greathub'::regnamespace, 'internal'::regnamespace)
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
  loop
    execute format(
      'create policy server_only on %s as restrictive for all to anon, authenticated using (false) with check (false)',
      t);
  end loop;
end $$;
