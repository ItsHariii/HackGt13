-- T2.2, T2.13, T2.16: catalog integrity, the canonical demo dataset and typo-tolerant search.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select ok(public.is_valid_gtin('00812345000016'), 'GS1 check digit accepted');
select ok(not public.is_valid_gtin('00812345000017'), 'Wrong check digit rejected');
select throws_ok(
  $$insert into public.products (source, title, gtin) values ('test', 'Bad GTIN', '00812345000017')$$,
  '23514', null, 'Catalog rejects an invalid GTIN'
);

select is((select count(*)::int from demomart.products), 60, 'About 60 DemoMart products');
select is(
  (select count(*)::int from demomart.products p where department = 'home_office'), 25, '25 home office products'
);
select is(
  (select count(*)::int from demomart.variants v join demomart.products p on p.id = v.product_id
   join demomart.listings l on l.variant_id = v.id
   where p.brand = '' or v.mpn = '' or not public.is_valid_gtin(v.gtin) or jsonb_array_length(l.spec) = 0),
  0,
  'Every variant has a brand, MPN, valid GTIN and spec'
);
select is(
  (select count(*)::int from demomart.products
   where brand not in ('Birchline', 'Kestrel', 'Vireo', 'Halden', 'Loop', 'Pica', 'Marlow', 'Aster', 'Fieldnote', 'Atlas', 'Volt')),
  0,
  'Fictional brands only'
);

-- SDD §16.1 numbers.
select is(
  (select total_minor from demomart.quote('[{"sku": "BL-CD-465", "qty": 1}, {"sku": "KS-MESH-TASK", "qty": 1},
    {"sku": "U2727", "qty": 1}, {"sku": "LOOP-C100-2M", "qty": 1}, {"sku": "PICA-1080", "qty": 1}]')),
  89605::bigint,
  'Flagship basket totals $896.05'
);
update demomart.offers set price_minor = 4500 where id = (
  select o.id from demomart.offers o join demomart.listings l on l.id = o.listing_id
  join demomart.variants v on v.id = l.variant_id where v.sku = 'PICA-1080'
);
select is(
  (select total_minor from demomart.quote('[{"sku": "BL-CD-465", "qty": 1}, {"sku": "KS-MESH-TASK", "qty": 1},
    {"sku": "U2727", "qty": 1}, {"sku": "LOOP-C100-2M", "qty": 1}, {"sku": "PICA-1080", "qty": 1}]')),
  89177::bigint,
  'Event 1: webcam $49 -> $45 gives $891.77'
);
update demomart.offers set price_minor = 31900 where id = 'dm_off_48300';
select is(
  (select total_minor from demomart.quote('[{"sku": "BL-CD-465", "qty": 1}, {"sku": "KS-MESH-TASK", "qty": 1},
    {"sku": "U2727", "qty": 1}, {"sku": "LOOP-C100-2M", "qty": 1}, {"sku": "PICA-1080", "qty": 1}]')),
  88107::bigint,
  'Event 2: deal-trap price $319 gives $881.07'
);
select is(
  (select total_minor from demomart.quote('[{"sku": "BL-CD-465", "qty": 1}, {"sku": "KS-MESH-TASK", "qty": 1},
    {"sku": "M27Q-USBC", "qty": 1}, {"sku": "LOOP-C100-2M", "qty": 1}, {"sku": "PICA-1080", "qty": 1}]')),
  87037::bigint,
  'Event 3: contract v8 with the Halden totals $870.37'
);
select is((select revision from demomart.offers where id = 'dm_off_48300'), 2, 'Mutations bump the offer revision');

select is(
  (select count(*)::int from public.products p
   where p.source = 'demomart' and not exists (select 1 from public.offers o where o.product_id = p.id)),
  0,
  'Every ingested DemoMart product has an offer'
);
select is(
  (select array_agg(k.slug || ':' || (select count(*) from public.kit_items i where i.kit_slug = k.slug) order by k.slug) from public.kits k),
  array['carry-on-kit:4', 'starter-home-office:5', 'wedding-guest:2'],
  'Three kits with their starter items'
);

set local role anon;
select is(
  (select array_agg(title order by title) from (select title from public.search_products('usb c monitr', 2)) s),
  array['Halden M27Q-USBC 27" 4K USB-C Monitor', 'Vireo U2727 27" 4K USB-C Monitor'],
  'Typo search "usb c monitr" returns the Vireo and Halden monitors first'
);
select is((select count(*)::int from public.search_products('', 10)), 0, 'Empty query returns nothing');
reset role;

select hasnt_column('public', 'payment_instruments', 'pan', 'No PAN column on payment instruments');

select * from finish();
rollback;
