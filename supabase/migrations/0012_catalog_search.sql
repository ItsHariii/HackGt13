-- Explore: search columns, external identity, search cache and kits (SDD §11.5, §17.6, §19.2).

alter table public.products
  add column upid text,
  add column image_url text check (image_url is null or image_url ~ '^https?://'),
  add column search_tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(brand, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(mpn, '') || ' ' || coalesce(gtin, '')), 'B')
    || setweight(to_tsvector('english', coalesce(category, '')), 'C')
  ) stored;

create index products_search_tsv_idx on public.products using gin (search_tsv);
create index products_title_trgm_idx on public.products using gin (title extensions.gin_trgm_ops);
create index products_upid_idx on public.products (upid) where upid is not null;

-- Every identity a product is known by, across sources (merge order: GTIN, UPID, brand + MPN).
create table public.product_external_refs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  source text not null check (source in ('shopify', 'upcitemdb', 'icecat', 'openfoodfacts', 'greathub', 'ebay')),
  external_id text not null,
  upid text,
  gtin text check (public.is_valid_gtin(gtin)),
  url text,
  created_at timestamptz not null default now(),
  unique (source, external_id)
);
create index product_external_refs_product_idx on public.product_external_refs (product_id);

-- Federated search cache: a repeat query within 10 minutes reads from here.
create table public.search_queries (
  id uuid primary key default gen_random_uuid(),
  query_hash text not null check (query_hash ~ '^sha256:[0-9a-f]{64}$'),
  query jsonb not null,
  source_status jsonb not null default '{}',
  result_product_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index search_queries_hash_idx on public.search_queries (query_hash, created_at desc);

create table public.kits (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  pack text not null,
  description text not null,
  hero_figure text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Requirement specs in the §7.2 shape; forking a kit copies them as pack_default.
create table public.kit_requirements (
  id uuid primary key default gen_random_uuid(),
  kit_slug text not null references public.kits (slug) on delete cascade on update cascade,
  requirement_key text not null check (requirement_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  spec jsonb not null check (jsonb_typeof(spec) = 'object'),
  importance public.requirement_importance not null,
  sort_order integer not null default 0,
  unique (kit_slug, requirement_key)
);

create table public.kit_items (
  id uuid primary key default gen_random_uuid(),
  kit_slug text not null references public.kits (slug) on delete cascade on update cascade,
  role text not null check (role ~ '^[a-z][a-z0-9_]*$'),
  product_id uuid not null references public.products (id) on delete cascade,
  qty integer not null default 1 check (qty between 1 and 99),
  sort_order integer not null default 0,
  unique (kit_slug, role, product_id)
);
create index kit_items_product_idx on public.kit_items (product_id);

do $$
declare
  t text;
begin
  foreach t in array array['product_external_refs', 'search_queries', 'kits', 'kit_requirements', 'kit_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;
grant select on public.product_external_refs, public.kits, public.kit_requirements, public.kit_items to anon, authenticated;
create policy product_external_refs_read on public.product_external_refs for select to anon, authenticated using (true);
create policy kits_read on public.kits for select to anon, authenticated using (true);
create policy kit_requirements_read on public.kit_requirements for select to anon, authenticated using (true);
create policy kit_items_read on public.kit_items for select to anon, authenticated using (true);
-- search_queries: server only.

-- Ranked, typo-tolerant local search. Full-text rank plus trigram word similarity on the title, so
-- "usb c monitr" still finds "… USB-C Monitor". Federated sources are merged by /api/search.
create or replace function public.search_products(p_query text, p_limit integer default 20)
returns table (
  product_id uuid,
  title text,
  brand text,
  gtin text,
  category text,
  roles text[],
  image_url text,
  rank real
) language sql stable security invoker
set search_path = ''
set pg_trgm.word_similarity_threshold = 0.3
as $$
  with q as (
    select
      nullif(btrim(p_query), '') as raw,
      websearch_to_tsquery('english', coalesce(p_query, '')) as ts
  )
  select p.id, p.title, p.brand, p.gtin, p.category, p.roles, p.image_url,
    (ts_rank(p.search_tsv, q.ts) + extensions.word_similarity(q.raw, p.title))::real as rank
  from public.products p, q
  where q.raw is not null
    and char_length(q.raw) <= 200
    and (p.search_tsv @@ q.ts or q.raw operator(extensions.<%) p.title)
  order by rank desc, p.title
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;
revoke all on function public.search_products(text, integer) from public;
grant execute on function public.search_products(text, integer) to anon, authenticated, service_role;
