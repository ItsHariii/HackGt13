-- Checkout snapshots, Consent Diffs, payment instruments and executions, orders, webhooks,
-- mandates and Evidence Packs (SDD §7.7, §13, §14, §15, §19.2).

create type public.diff_classification as enum ('identical', 'auto', 'reapprove', 'block');
create type public.payment_rail as enum ('visa_acceptance', 'vic', 'authorize_net', 'simulated');
create type public.execution_status as enum ('started', 'authorized', 'declined', 'error');
create type public.order_status as enum ('created', 'manual_review', 'confirmed', 'canceled', 'shipped', 'fulfilled');
create type public.mandate_status as enum ('armed', 'fired_executed', 'fired_blocked', 'expired', 'cancelled');

create table public.checkout_snapshots (
  id uuid primary key default gen_random_uuid(),
  contract_version_id uuid not null references public.contract_versions (id) on delete cascade,
  merchant_id text not null,
  acp_session_id text not null,
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  state_hash text not null check (state_hash ~ '^sha256:[0-9a-f]{64}$'),
  fetched_at timestamptz not null default now()
);
create index checkout_snapshots_version_idx on public.checkout_snapshots (contract_version_id, fetched_at desc);

create table public.consent_diffs (
  id uuid primary key default gen_random_uuid(),
  contract_version_id uuid not null references public.contract_versions (id) on delete cascade,
  snapshot_id uuid references public.checkout_snapshots (id) on delete set null,
  reproof_report_id uuid references public.proof_reports (id) on delete set null,
  classification public.diff_classification not null,
  changes jsonb not null default '[]' check (jsonb_typeof(changes) = 'array'),
  current_total_minor bigint not null check (current_total_minor >= 0),
  created_at timestamptz not null default now()
);
create index consent_diffs_version_idx on public.consent_diffs (contract_version_id, created_at desc);

-- Tokenized references only. There is deliberately no column that could hold a PAN or CVV.
create table public.payment_instruments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  rail public.payment_rail not null,
  rail_ref text not null,
  brand text,
  last4 text check (last4 ~ '^[0-9]{4}$'),
  exp_month smallint check (exp_month between 1 and 12),
  exp_year smallint check (exp_year between 2000 and 2100),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (rail, rail_ref)
);
create index payment_instruments_user_idx on public.payment_instruments (user_id);
create unique index payment_instruments_one_default on public.payment_instruments (user_id) where is_default;

-- Rows are created only by internal.begin_execution (0007).
create table public.payment_executions (
  id uuid primary key default gen_random_uuid(),
  contract_version_id uuid not null references public.contract_versions (id) on delete cascade,
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 255),
  -- NO ACTION, not RESTRICT: checked at statement end, so a plan delete can cascade through both.
  diff_id uuid not null references public.consent_diffs (id),
  instrument_id uuid references public.payment_instruments (id) on delete set null,
  rail public.payment_rail,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  status public.execution_status not null default 'started',
  rail_ref text,
  error jsonb,
  token_consumed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'started') = (completed_at is null))
);
create index payment_executions_version_idx on public.payment_executions (contract_version_id);
create index payment_executions_diff_idx on public.payment_executions (diff_id);
-- At most one in-flight execution per contract version.
create unique index payment_executions_one_inflight on public.payment_executions (contract_version_id)
where status = 'started';

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null unique references public.payment_executions (id) on delete cascade,
  merchant_id text not null,
  merchant_order_id text not null,
  status public.order_status not null default 'created',
  total_minor bigint not null check (total_minor >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  events jsonb not null default '[]' check (jsonb_typeof(events) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, merchant_order_id)
);
create trigger orders_touch before update on public.orders
for each row execute function internal.touch_updated_at();

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  unique (provider, event_id)
);
create index webhook_events_unprocessed_idx on public.webhook_events (received_at) where processed_at is null;

create table public.mandates (
  id uuid primary key default gen_random_uuid(),
  contract_version_id uuid not null unique references public.contract_versions (id) on delete cascade,
  trigger jsonb not null check (trigger ->> 'type' in ('price_lte', 'back_in_stock', 'recurring')),
  not_after timestamptz not null,
  status public.mandate_status not null default 'armed',
  next_check_at timestamptz not null default now(),
  last_checked_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mandates_due_idx on public.mandates (next_check_at) where status = 'armed';
create trigger mandates_touch before update on public.mandates
for each row execute function internal.touch_updated_at();

create table public.evidence_packs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  storage_path text not null,
  sha256 text not null check (sha256 ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index evidence_packs_order_idx on public.evidence_packs (order_id);
