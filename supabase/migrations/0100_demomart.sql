-- DemoMart, the clearly labeled test merchant (SDD §16). Its own schema, reached only by the
-- DemoMart server through the secret key. ProofCart never reads these tables: it sees DemoMart only
-- through ACP, JSON-LD and signed webhooks, exactly like a real merchant.
--
-- Caveat: Supabase secret keys map to service_role, so any secret key for this project can reach
-- this schema. The separation is enforced in code (ProofCart never imports DemoMart types or
-- queries this schema), not by the database. A separate Supabase project would make it hard.

create schema demomart;
revoke all on schema demomart from public, anon, authenticated;
grant usage on schema demomart to service_role;

create table demomart.sellers (
  id text primary key check (id ~ '^dm_seller_[0-9]+$'),
  name text not null,
  created_at timestamptz not null default now()
);

-- kind = 'return':   {returnable, windowDays, feeMinor, finalSale}
-- kind = 'shipping': {label, flatMinor}
-- kind = 'tax':      {label, rateBps}
create table demomart.policies (
  id text primary key check (id ~ '^[a-z0-9_]+$'),
  kind text not null check (kind in ('return', 'shipping', 'tax')),
  name text not null,
  terms jsonb not null check (jsonb_typeof(terms) = 'object'),
  created_at timestamptz not null default now()
);

create table demomart.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  brand text not null,
  name text not null,
  department text not null check (department in ('home_office', 'apparel', 'travel')),
  category text not null,
  roles text[] not null default '{}',
  description text not null,
  image_path text,
  created_at timestamptz not null default now()
);

create table demomart.variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references demomart.products (id) on delete cascade,
  sku text not null unique check (sku ~ '^[A-Z0-9][A-Z0-9-]*$'),
  gtin text not null unique check (public.is_valid_gtin(gtin)),
  mpn text not null,
  option_label text,
  sort_order integer not null default 0
);
create index variants_product_idx on demomart.variants (product_id);

-- spec is mutable on purpose: the Chaos Panel's spec_edit rewrites it on the same SKU.
-- spec is an ordered array of schema.org PropertyValue-style {name, value} pairs.
-- jsonld_spec, when set, is what the page's JSON-LD claims instead (the jsonld_conflict mutation).
create table demomart.listings (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null unique references demomart.variants (id) on delete cascade,
  title text not null,
  spec jsonb not null check (jsonb_typeof(spec) = 'array'),
  jsonld_spec jsonb check (jsonld_spec is null or jsonb_typeof(jsonld_spec) = 'array'),
  injection_text text,
  updated_at timestamptz not null default now()
);

create table demomart.offers (
  id text primary key check (id ~ '^dm_off_[0-9]+$'),
  listing_id uuid not null unique references demomart.listings (id) on delete cascade,
  seller_id text not null references demomart.sellers (id),
  price_minor bigint not null check (price_minor >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  availability text not null default 'in_stock' check (availability in ('in_stock', 'limited', 'out_of_stock')),
  stock integer not null default 0 check (stock >= 0),
  delivery_min_days integer not null check (delivery_min_days >= 0),
  delivery_max_days integer not null,
  final_sale boolean not null default false,
  return_policy_id text not null references demomart.policies (id),
  pack_size integer not null default 1 check (pack_size >= 1),
  subscription jsonb,
  -- Bumped by every mutation; doubles as an ETag for ACP reads.
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  check (delivery_max_days >= delivery_min_days)
);
create index offers_seller_idx on demomart.offers (seller_id);
create index offers_return_policy_idx on demomart.offers (return_policy_id);

create table demomart.checkout_sessions (
  id text primary key check (id ~ '^cs_[A-Za-z0-9]+$'),
  status text not null default 'not_ready_for_payment'
    check (status in ('not_ready_for_payment', 'ready_for_payment', 'completed', 'canceled')),
  line_items jsonb not null default '[]' check (jsonb_typeof(line_items) = 'array'),
  fulfillment_address jsonb,
  fulfillment_option_id text,
  totals jsonb not null default '[]' check (jsonb_typeof(totals) = 'array'),
  messages jsonb not null default '[]' check (jsonb_typeof(messages) = 'array'),
  -- {contractId, version, bodyHash} as presented by the agent.
  contract_ref jsonb,
  agent_key_id text,
  create_idempotency_key text unique,
  complete_idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  canceled_at timestamptz
);

create table demomart.orders (
  id text primary key check (id ~ '^dm_ord_[A-Za-z0-9]+$'),
  checkout_session_id text not null unique references demomart.checkout_sessions (id),
  status text not null default 'created'
    check (status in ('created', 'manual_review', 'confirmed', 'canceled', 'shipped', 'fulfilled')),
  total_minor bigint not null check (total_minor >= 0),
  currency text not null default 'USD',
  -- {rail, transactionId, status, reconciliationId}
  payment jsonb not null default '{}',
  -- "✓ Customer-signed contract v8 · hash …": grant and signature checks done at /complete.
  contract_verification jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table demomart.mutation_log (
  id bigint generated always as identity primary key,
  mutation text not null check (mutation in (
    'price_drop', 'price_raise', 'spec_edit', 'variant_swap', 'seller_rotation', 'final_sale_flip',
    'return_fee_added', 'return_window_shortened', 'shipping_fee_added', 'delivery_slip', 'out_of_stock',
    'pack_size_shrink', 'subscription_added', 'listing_injection_text', 'jsonld_conflict', 'recall_posted',
    'reset'
  )),
  scenario text,
  target jsonb not null default '{}',
  before jsonb,
  after jsonb,
  actor text not null default 'chaos-panel',
  created_at timestamptz not null default now()
);
create index mutation_log_created_idx on demomart.mutation_log (created_at desc);

-- TAP replay window: a nonce may be seen once per key within 8 minutes (SDD §13.3).
create table demomart.tap_nonces (
  key_id text not null,
  nonce text not null,
  seen_at timestamptz not null default now(),
  primary key (key_id, nonce)
);
create index tap_nonces_seen_idx on demomart.tap_nonces (seen_at);

create table demomart.agent_log (
  id bigint generated always as identity primary key,
  request_id text,
  method text not null,
  path text not null,
  key_id text,
  tag text,
  verdict text not null check (verdict in ('accepted', 'rejected')),
  reason text,
  created_at timestamptz not null default now()
);
create index agent_log_created_idx on demomart.agent_log (created_at desc);

create table demomart.webhook_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null check (event_type in ('order_created', 'order_updated')),
  order_id text not null references demomart.orders (id),
  payload jsonb not null,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index webhook_outbox_pending_idx on demomart.webhook_outbox (next_attempt_at) where delivered_at is null;

create or replace function demomart.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger listings_touch before update on demomart.listings
for each row execute function demomart.touch_updated_at();
create trigger checkout_sessions_touch before update on demomart.checkout_sessions
for each row execute function demomart.touch_updated_at();
create trigger orders_touch before update on demomart.orders
for each row execute function demomart.touch_updated_at();

create or replace function demomart.offers_bump_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;
create trigger offers_bump_revision before update on demomart.offers
for each row execute function demomart.offers_bump_revision();

-- Price a cart the way checkout will: merchandise, one flat shipping charge per order, and tax on
-- merchandise rounded half-up to the cent. p_items = [{"sku": "U2727", "qty": 1}, …].
create or replace function demomart.quote(p_items jsonb)
returns table (merchandise_minor bigint, shipping_minor bigint, tax_minor bigint, total_minor bigint)
language plpgsql stable set search_path = '' as $$
declare
  v_merch bigint;
  v_lines integer;
  v_ship bigint;
  v_rate bigint;
begin
  select coalesce(sum(o.price_minor * (i.value ->> 'qty')::bigint), 0), count(o.id)
  into v_merch, v_lines
  from jsonb_array_elements(p_items) i
  left join demomart.variants v on v.sku = i.value ->> 'sku'
  left join demomart.listings l on l.variant_id = v.id
  left join demomart.offers o on o.listing_id = l.id;
  if v_lines <> jsonb_array_length(p_items) then
    raise exception 'unknown_sku';
  end if;
  select (terms ->> 'flatMinor')::bigint into v_ship from demomart.policies where id = 'ship_standard';
  select (terms ->> 'rateBps')::bigint into v_rate from demomart.policies where id = 'tax_default';
  v_ship := case when v_lines > 0 then coalesce(v_ship, 0) else 0 end;
  merchandise_minor := v_merch;
  shipping_minor := v_ship;
  tax_minor := (v_merch * coalesce(v_rate, 0) + 5000) / 10000;
  total_minor := merchandise_minor + shipping_minor + tax_minor;
  return next;
end;
$$;

do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'demomart' loop
    execute format('alter table demomart.%I enable row level security', t);
  end loop;
end;
$$;
grant all on all tables in schema demomart to service_role;
grant usage, select on all sequences in schema demomart to service_role;
revoke all on all functions in schema demomart from public, anon, authenticated;
grant execute on all functions in schema demomart to service_role;

select cron.schedule('nonce-gc', '*/10 * * * *',
  $$delete from demomart.tap_nonces where seen_at < now() - interval '8 minutes'$$);
