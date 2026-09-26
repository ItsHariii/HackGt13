-- Solver runs, baskets and proof reports (SDD §8.4, §9, §19.2).
-- Reports are written by the server only; clients read them through RLS (0008) and Realtime (0009).

create type public.verdict as enum ('pass', 'fail', 'unknown');
create type public.solver_status as enum ('optimal', 'infeasible', 'error');
create type public.proof_report_kind as enum ('plan', 'reproof');

create table public.solver_runs (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  set_id uuid not null references public.requirement_sets (id) on delete cascade,
  input_hash text not null check (input_hash ~ '^sha256:[0-9a-f]{64}$'),
  status public.solver_status not null,
  objective numeric,
  conflict_set jsonb check (conflict_set is null or jsonb_typeof(conflict_set) = 'array'),
  relaxations jsonb check (relaxations is null or jsonb_typeof(relaxations) = 'array'),
  ms integer check (ms >= 0),
  created_at timestamptz not null default now(),
  check (status <> 'infeasible' or conflict_set is not null)
);
create index solver_runs_plan_idx on public.solver_runs (plan_id, created_at desc);
create index solver_runs_set_idx on public.solver_runs (set_id);

create table public.baskets (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  solver_run_id uuid references public.solver_runs (id) on delete cascade,
  label text not null check (label ~ '^[A-Z]$'),
  created_at timestamptz not null default now(),
  unique (solver_run_id, label)
);
create index baskets_plan_idx on public.baskets (plan_id);

create table public.basket_items (
  id uuid primary key default gen_random_uuid(),
  basket_id uuid not null references public.baskets (id) on delete cascade,
  role text not null check (role ~ '^[a-z][a-z0-9_]*$'),
  offer_id uuid not null references public.offers (id) on delete restrict,
  qty integer not null default 1 check (qty between 1 and 99),
  unique (basket_id, role, offer_id)
);
create index basket_items_offer_idx on public.basket_items (offer_id);

create table public.proof_reports (
  id uuid primary key default gen_random_uuid(),
  kind public.proof_report_kind not null default 'plan',
  basket_id uuid not null references public.baskets (id) on delete cascade,
  set_id uuid not null references public.requirement_sets (id) on delete cascade,
  engine_version text not null,
  packs jsonb not null check (jsonb_typeof(packs) = 'object'),
  summary jsonb not null check (jsonb_typeof(summary) = 'object'),
  report jsonb not null check (jsonb_typeof(report) = 'object'),
  hash text not null check (hash ~ '^sha256:[0-9a-f]{64}$'),
  evaluated_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index proof_reports_basket_idx on public.proof_reports (basket_id, created_at desc);
create index proof_reports_set_idx on public.proof_reports (set_id);

-- One row per result so the live Proof panel can stream them (SDD §19.4).
create table public.proof_results (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.proof_reports (id) on delete cascade,
  requirement_id uuid not null references public.requirements (id) on delete cascade,
  scope jsonb not null check (jsonb_typeof(scope) = 'object'),
  verdict public.verdict not null,
  state public.evidence_state not null,
  reason text,
  observed jsonb,
  target jsonb,
  fact_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  check (verdict <> 'unknown' or reason is not null)
);
create index proof_results_report_idx on public.proof_results (report_id);
create index proof_results_requirement_idx on public.proof_results (requirement_id);
