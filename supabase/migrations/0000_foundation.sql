-- Foundation infrastructure only. Domain tables begin with Phase 2's 0001 migration.
create schema if not exists extensions;
create schema if not exists internal;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgmq;

revoke all on schema internal from public, anon, authenticated;

-- A real database ping, callable only by server credentials.
create or replace function public.foundation_health()
returns boolean language sql stable set search_path = '' as $$ select true; $$;
revoke all on function public.foundation_health() from public, anon, authenticated;
grant execute on function public.foundation_health() to service_role;

-- Disposable spike tables. These do not substitute for Phase 2 plans or ledger.
create table public.foundation_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.foundation_events (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.foundation_plans(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index foundation_plans_owner_idx on public.foundation_plans(owner_id);
create index foundation_events_plan_created_idx on public.foundation_events(plan_id, created_at desc);
alter table public.foundation_plans enable row level security;
alter table public.foundation_events enable row level security;
revoke all on public.foundation_plans, public.foundation_events from anon, authenticated;
grant select, insert, delete on public.foundation_plans to authenticated;
grant select, insert on public.foundation_events to authenticated;
grant all on public.foundation_plans, public.foundation_events to service_role;
create policy foundation_plans_read on public.foundation_plans for select to authenticated
using (owner_id = (select auth.uid()));
create policy foundation_plans_create on public.foundation_plans for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy foundation_plans_delete on public.foundation_plans for delete to authenticated
using (owner_id = (select auth.uid()));
create policy foundation_events_read on public.foundation_events for select to authenticated
using (exists (select 1 from public.foundation_plans p where p.id = plan_id and p.owner_id = (select auth.uid())));
create policy foundation_events_create on public.foundation_events for insert to authenticated
with check (exists (select 1 from public.foundation_plans p where p.id = plan_id and p.owner_id = (select auth.uid())));

-- Only the owner may join plan:{id}. No client permission to forge broadcasts.
create policy foundation_broadcast_read on realtime.messages for select to authenticated
using (
  extension = 'broadcast' and exists (
    select 1 from public.foundation_plans p
    where p.owner_id = (select auth.uid()) and realtime.topic() = 'plan:' || p.id::text
  )
);
create or replace function internal.broadcast_foundation_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('id', new.id, 'plan_id', new.plan_id, 'created_at', new.created_at), 'insert', 'plan:' || new.plan_id::text, true);
  return new;
end;
$$;
revoke all on function internal.broadcast_foundation_event() from public, anon, authenticated;
create trigger foundation_event_broadcast after insert on public.foundation_events
for each row execute function internal.broadcast_foundation_event();
