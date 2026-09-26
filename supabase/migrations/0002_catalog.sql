-- Catalog and evidence: sources, products, offers, facts (SDD §7.3, §11, §19.2).
-- Search columns, external refs and kits are added in 0012_catalog_search.sql.

-- Ascending strength, so `state >= 'source_stated'` means "at least source_stated" (SDD §7.3).
create type public.evidence_state as enum ('unknown', 'estimated', 'supported', 'source_stated', 'verified');
create type public.fact_subject_kind as enum ('product', 'offer');
create type public.availability as enum (
  'in_stock', 'limited', 'backorder', 'preorder', 'out_of_stock', 'discontinued', 'unknown'
);

-- GS1 mod-10 check digit over GTIN-8/12/13/14. Pure; safe to expose.
create or replace function public.is_valid_gtin(p_gtin text)
returns boolean language sql immutable strict parallel safe set search_path = '' as $$
  select p_gtin ~ '^([0-9]{8}|[0-9]{12,14})$'
    and (
      select sum(substr(p_gtin, length(p_gtin) - i, 1)::int * case when i % 2 = 1 then 3 else 1 end) % 10
      from generate_series(1, length(p_gtin) - 1) as i
    ) = (10 - right(p_gtin, 1)::int) % 10;
$$;

-- One row per fetched document. Raw bytes live in Storage at sources/{sha256}.{ext} (SDD §11.3).
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  url text not null check (char_length(url) <= 2048),
  source_type text not null check (source_type in (
    'acp_checkout', 'json_ld', 'merchant_api', 'shopify_ucp', 'upcitemdb', 'icecat',
    'cpsc', 'openfoodfacts', 'ebay', 'fixture', 'user_input', 'unstructured'
  )),
  content_hash text not null check (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  content_type text,
  storage_path text,
  http_status integer check (http_status between 100 and 599),
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index sources_content_hash_idx on public.sources (content_hash);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text,
  merchant_id text,
  title text not null check (char_length(title) between 1 and 500),
  brand text,
  -- Identity resolution merges on GTIN first (SDD §11.5), so one product per GTIN.
  gtin text check (public.is_valid_gtin(gtin)),
  mpn text,
  category text,
  roles text[] not null default '{}',
  -- Raw attributes that don't map to a pack field. Never fed to a rule.
  attributes jsonb not null default '{}' check (jsonb_typeof(attributes) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_gtin_key on public.products (gtin) where gtin is not null;
create index products_brand_mpn_idx on public.products (lower(brand), lower(mpn)) where mpn is not null;
create index products_roles_idx on public.products using gin (roles);
create trigger products_touch before update on public.products
for each row execute function internal.touch_updated_at();

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  source text not null,
  external_id text not null,
  merchant_id text not null,
  seller_id text,
  price_minor bigint check (price_minor >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  shipping_minor bigint check (shipping_minor >= 0),
  availability public.availability not null default 'unknown',
  delivery_earliest date,
  delivery_latest date,
  final_sale boolean,
  return_policy jsonb check (return_policy is null or jsonb_typeof(return_policy) = 'object'),
  url text,
  -- Historical listings (e.g. UPCitemdb "last seen") are shown but never used for price rules.
  reference_only boolean not null default false,
  retrieved_at timestamptz not null default now(),
  fresh_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id),
  check (delivery_earliest is null or delivery_latest is null or delivery_earliest <= delivery_latest),
  check (fresh_until >= retrieved_at)
);
create index offers_product_idx on public.offers (product_id);
create index offers_fresh_until_idx on public.offers (fresh_until);
create trigger offers_touch before update on public.offers
for each row execute function internal.touch_updated_at();

create table public.facts (
  id uuid primary key default gen_random_uuid(),
  subject_kind public.fact_subject_kind not null,
  subject_id uuid not null,
  field text not null check (field ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
  value jsonb,
  raw text,
  unit text,
  qualifier text,
  state public.evidence_state not null,
  -- Why the state is weak: stale, conflict, insufficient_evidence, subjective, missing.
  state_reason text,
  conflict boolean not null default false,
  source_id uuid not null references public.sources (id) on delete restrict,
  quote text,
  span int4range,
  extractor text not null,
  retrieved_at timestamptz not null default now(),
  fresh_until timestamptz,
  superseded_by uuid references public.facts (id) on delete set null,
  created_at timestamptz not null default now(),
  check (span is null or (quote is not null and not isempty(span) and lower(span) >= 0)),
  check (superseded_by is distinct from id)
);
create index facts_subject_field_idx on public.facts (subject_id, field);
create index facts_current_idx on public.facts (subject_id, field) where superseded_by is null;
create index facts_fresh_until_idx on public.facts (fresh_until);
create index facts_source_idx on public.facts (source_id);

-- subject_id is polymorphic; keep it honest.
create or replace function internal.facts_subject_exists()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.subject_kind = 'product' and not exists (select 1 from public.products where id = new.subject_id)
     or new.subject_kind = 'offer' and not exists (select 1 from public.offers where id = new.subject_id) then
    raise exception 'fact subject % % does not exist', new.subject_kind, new.subject_id
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;
revoke all on function internal.facts_subject_exists() from public, anon, authenticated;
create trigger facts_subject_exists before insert or update of subject_kind, subject_id on public.facts
for each row execute function internal.facts_subject_exists();

-- Deleting a product or offer removes its facts (no FK can express this).
create or replace function internal.facts_cascade_subject()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.facts
  where subject_id = old.id
    and subject_kind = (case when tg_table_name = 'products' then 'product' else 'offer' end)::public.fact_subject_kind;
  return old;
end;
$$;
revoke all on function internal.facts_cascade_subject() from public, anon, authenticated;
create trigger products_facts_cascade after delete on public.products
for each row execute function internal.facts_cascade_subject();
create trigger offers_facts_cascade after delete on public.offers
for each row execute function internal.facts_cascade_subject();
