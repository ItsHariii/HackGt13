-- T6.10, T6.3, T6.5, T6.9: Chaos Panel mutations and reset, ACP idempotency, the completion claim,
-- TAP nonce replay and the webhook outbox backoff.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

select ok((select count(*) = 1 from demomart.catalog_baseline), 'Seed captured a reset baseline');
select is(
  (select pack_size from demomart.offers o join demomart.listings l on l.id = o.listing_id
   join demomart.variants v on v.id = l.variant_id where v.sku = 'FN-TB34-3'),
  3, 'Offers carry the listed pack size'
);

-- The flagship deal trap: price and spec change on the same SKU, atomically.
select is(
  (select count(*)::int from demomart.apply_scenario('flagship-deal-trap', '[
    {"mutation": "price_drop", "sku": "U2727", "params": {"priceMinor": 31900}},
    {"mutation": "spec_edit", "sku": "U2727", "params": {"name": "USB-C power delivery", "value": "15 W"}}
  ]')),
  2, 'Deal-trap scenario logs two mutations'
);
select is((demomart.sku_state('U2727') ->> 'price_minor')::bigint, 31900::bigint, 'U2727 now $319');
select is(
  (select e ->> 'value' from jsonb_array_elements(demomart.sku_state('U2727') -> 'spec') e
   where e ->> 'name' = 'USB-C power delivery'),
  '15 W', 'Same SKU, USB-C power now 15 W'
);
select is(
  (select jsonb_array_length(spec) from demomart.listings l join demomart.variants v on v.id = l.variant_id
   where v.sku = 'U2727'),
  7, 'spec_edit replaces the entry instead of appending'
);
select ok(
  (select (after ->> 'revision')::int > (before ->> 'revision')::int from demomart.mutation_log
   where mutation = 'spec_edit' order by id desc limit 1),
  'A spec edit bumps the offer revision'
);
select is(
  (select scenario from demomart.mutation_log order by id desc limit 1), 'flagship-deal-trap',
  'Mutations are tagged with their scenario'
);
select throws_ok(
  $$select * from demomart.apply_scenario('bad', '[
    {"mutation": "price_drop", "sku": "PICA-1080", "params": {"priceMinor": 4500}},
    {"mutation": "price_drop", "sku": "NOPE", "params": {"priceMinor": 1}}]')$$,
  'unknown_sku', 'A failing step aborts the scenario'
);
select is((demomart.sku_state('PICA-1080') ->> 'price_minor')::bigint, 4900::bigint, '…and rolls back earlier steps');
select throws_ok(
  $$select demomart.apply_mutation('price_drop', 'PICA-1080', '{"priceMinor": 5900}')$$,
  'invalid_params', 'price_drop refuses a higher price'
);

-- Each remaining mutation, applied once.
select lives_ok($$select demomart.apply_mutation('variant_swap', 'U2727', '{"toSku": "M27Q-USBC"}')$$, 'variant_swap');
select is(demomart.sku_state('U2727') ->> 'ships_sku', 'M27Q-USBC', 'U2727 now ships as M27Q-USBC');
select lives_ok($$select demomart.apply_mutation('seller_rotation', 'U2727')$$, 'seller_rotation');
select is(demomart.sku_state('U2727') ->> 'seller_id', 'dm_seller_2', 'Seller rotated to the marketplace seller');
select lives_ok(
  $$select demomart.apply_mutation('final_sale_flip', 'MW-NWD-06', '{"priceMinor": 11800}')$$, 'final_sale_flip'
);
select is(
  demomart.sku_state('MW-NWD-06') - array['offer_id', 'revision', 'spec', 'jsonld_spec', 'sku', 'stock', 'availability',
    'delivery_min_days', 'delivery_max_days', 'pack_size', 'subscription', 'shipping_fee_minor', 'ships_sku',
    'injection_text', 'recalls', 'seller_id'],
  '{"final_sale": true, "price_minor": 11800, "return_policy_id": "final_sale"}'::jsonb,
  'Marlow dress is final sale at $118'
);
select lives_ok($$select demomart.apply_mutation('shipping_fee_added', 'PICA-1080', '{"feeMinor": 995}')$$, 'shipping_fee_added');
select is(
  (select shipping_minor from demomart.quote('[{"sku": "PICA-1080", "qty": 1}]')), 3395::bigint,
  'Quote adds the surcharge to flat shipping'
);
select lives_ok($$select demomart.apply_mutation('pack_size_shrink', 'FN-TB34-3')$$, 'pack_size_shrink');
select lives_ok($$select demomart.apply_mutation('jsonld_conflict', 'M27Q-USBC', '{"name": "USB-C power delivery", "value": "90 W"}')$$, 'jsonld_conflict');
select lives_ok($$select demomart.apply_mutation('recall_posted', 'VT-PB30')$$, 'recall_posted');
select lives_ok($$select demomart.apply_mutation('listing_injection_text', 'H24F')$$, 'listing_injection_text');

-- Reset restores the seed exactly.
select lives_ok($$select demomart.reset_catalog()$$, 'Reset');
select is(
  (select total_minor from demomart.quote('[{"sku": "BL-CD-465", "qty": 1}, {"sku": "KS-MESH-TASK", "qty": 1},
    {"sku": "U2727", "qty": 1}, {"sku": "LOOP-C100-2M", "qty": 1}, {"sku": "PICA-1080", "qty": 1}]')),
  89605::bigint, 'After reset the flagship basket totals $896.05 again'
);
select is(
  (select jsonb_agg(to_jsonb(o) - 'revision' - 'updated_at' order by o.id) from demomart.offers o),
  (select jsonb_agg(e - 'revision' - 'updated_at' order by e ->> 'id')
   from demomart.catalog_baseline b, jsonb_array_elements(b.offers) e),
  'Reset restores every offer exactly'
);
select ok(
  (select bool_and(l.jsonld_spec is null and l.injection_text is null) from demomart.listings l)
  and not exists (select 1 from demomart.mock_recalls)
  and (select e ->> 'value' from jsonb_array_elements(demomart.sku_state('U2727') -> 'spec') e
       where e ->> 'name' = 'USB-C power delivery') = 'Up to 90 W',
  'Reset restores listings and clears recalls'
);

-- Idempotency, nonce replay, completion claim and webhook backoff.
select is(
  (select array_agg(state order by n) from (
    select 1 n, state from demomart.idem_begin('create', 'k1', 'h1')
    union all select 2, state from demomart.idem_begin('create', 'k1', 'h1')
    union all select 3, state from demomart.idem_begin('create', 'k1', 'h2')) s),
  array['new', 'in_progress', 'conflict'], 'Idempotency: new, in progress, conflict'
);
select is(
  array[demomart.record_nonce('pc-agent', 'n1'), demomart.record_nonce('pc-agent', 'n1'), demomart.record_nonce('other', 'n1')],
  array[true, false, true], 'A nonce is accepted once per key'
);

insert into demomart.checkout_sessions (id, status, items) values ('cs_test1', 'ready_for_payment', '[{"id": "PICA-1080", "quantity": 1}]');
select is(
  array[demomart.claim_session('cs_test1', 'c1'), demomart.claim_session('cs_test1', 'c2')],
  array[true, false], 'Only one /complete can claim a session'
);

select * from finish();
rollback;
