-- Operational records: AI call accounting and ProofBench runs (SDD §10.4, §19.2, §22).

create type public.ai_task as enum ('A1', 'A2', 'A3', 'A4', 'A5');

-- Server-only cost and latency log. No client grants.
create table public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.plans (id) on delete set null,
  task public.ai_task not null,
  provider text not null check (provider in ('openai', 'meta')),
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_tokens integer not null default 0 check (cached_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_usd_micros bigint not null default 0 check (cost_usd_micros >= 0),
  latency_ms integer check (latency_ms >= 0),
  fell_back boolean not null default false,
  error text,
  created_at timestamptz not null default now()
);
create index ai_calls_created_idx on public.ai_calls (created_at desc);
create index ai_calls_plan_idx on public.ai_calls (plan_id);

-- Public scoreboard for the /bench page.
create table public.bench_runs (
  id uuid primary key default gen_random_uuid(),
  git_sha text not null check (git_sha ~ '^[0-9a-f]{7,40}$'),
  results jsonb not null check (jsonb_typeof(results) = 'array'),
  passed integer not null check (passed >= 0),
  total integer not null check (total >= 0),
  created_at timestamptz not null default now(),
  check (passed <= total)
);
create index bench_runs_created_idx on public.bench_runs (created_at desc);

alter table public.ai_calls enable row level security;
alter table public.bench_runs enable row level security;
revoke all on public.ai_calls, public.bench_runs from public, anon, authenticated;
grant all on public.ai_calls, public.bench_runs to service_role;
grant select on public.bench_runs to anon, authenticated;
create policy bench_runs_read on public.bench_runs for select to anon, authenticated using (true);
