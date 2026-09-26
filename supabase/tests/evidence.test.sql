-- T7.1, T7.7: the atomic fact writer and the snapshot cache index.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.products (id, source, title)
values ('c0000000-0000-4000-8000-000000000001', 'test', 'Evidence test monitor');
insert into public.sources (id, url, source_type, content_hash, http_status) values
  ('d0000000-0000-4000-8000-000000000001', 'https://icecat.test/1', 'icecat', 'sha256:' || repeat('a', 64), 200),
  ('d0000000-0000-4000-8000-000000000002', 'https://shop.test/p/1', 'json_ld', 'sha256:' || repeat('b', 64), 200),
  ('d0000000-0000-4000-8000-000000000003', 'https://shop.test/p/1', 'json_ld', 'sha256:' || repeat('c', 64), 200);

select ok(
  exists (select 1 from pg_indexes where indexname = 'sources_url_fetched_idx'),
  'Snapshot cache lookups are indexed by url, type and time'
);

-- Manufacturer says 90 W.
select is(
  cardinality(public.srv_write_facts($$[{
    "subject_kind": "product", "subject_id": "c0000000-0000-4000-8000-000000000001",
    "field": "monitor.usb_c_pd_watts", "expected_current": [],
    "inserts": [{ "value": {"value": 90, "unit": "W"}, "raw": "90 W", "unit": "W", "state": "verified",
                  "conflict": false, "source_id": "d0000000-0000-4000-8000-000000000001",
                  "extractor": "icecat", "retrieved_at": "2026-09-26T10:00:00Z",
                  "fresh_until": "2026-10-26T10:00:00Z", "supersedes": [] }],
    "flag_conflict": [] }]$$::jsonb)),
  1,
  'Writes a first fact'
);

-- The seller page says 15 W: the writer inserts it flagged and flags the manufacturer's fact.
select lives_ok(
  format($$select public.srv_write_facts('[{
    "subject_kind": "product", "subject_id": "c0000000-0000-4000-8000-000000000001",
    "field": "monitor.usb_c_pd_watts", "expected_current": ["%s"],
    "inserts": [{ "value": {"value": 15, "unit": "W"}, "raw": "15 W", "state": "source_stated", "conflict": true,
                  "source_id": "d0000000-0000-4000-8000-000000000002", "quote": "USB-C 15 W", "span": [4, 14],
                  "extractor": "jsonld", "supersedes": [] }],
    "flag_conflict": ["%s"] }]'::jsonb)$$,
    (select id from public.facts where extractor = 'icecat'), (select id from public.facts where extractor = 'icecat')),
  'Writes a disagreeing fact'
);
select is(
  (select array_agg(extractor || ':' || conflict order by extractor) from public.facts where superseded_by is null),
  array['icecat:true', 'jsonld:true'],
  'Both readings are flagged as a conflict'
);
select is(
  (select span from public.facts where extractor = 'jsonld'),
  int4range(4, 14),
  'The quote span is stored as a range'
);
select is(
  (select value from public.facts where extractor = 'jsonld'),
  '{"value": 15, "unit": "W"}'::jsonb,
  'The value is stored as JSON'
);

-- A plan computed before the seller fact existed is stale.
select throws_ok(
  format($$select public.srv_write_facts('[{
    "subject_kind": "product", "subject_id": "c0000000-0000-4000-8000-000000000001",
    "field": "monitor.usb_c_pd_watts", "expected_current": ["%s"],
    "inserts": [{ "value": {"value": 90, "unit": "W"}, "state": "source_stated",
                  "source_id": "d0000000-0000-4000-8000-000000000003", "extractor": "jsonld", "supersedes": [] }],
    "flag_conflict": [] }]'::jsonb)$$,
    (select id from public.facts where extractor = 'icecat')),
  '40001', 'stale_fact_plan',
  'A plan made against old facts is rejected'
);

-- The seller fixes the page: the new reading supersedes theirs; the old conflict stays on record.
select lives_ok(
  format($$select public.srv_write_facts('[{
    "subject_kind": "product", "subject_id": "c0000000-0000-4000-8000-000000000001",
    "field": "monitor.usb_c_pd_watts", "expected_current": ["%s", "%s"],
    "inserts": [{ "value": {"value": 90, "unit": "W"}, "state": "source_stated", "conflict": false,
                  "source_id": "d0000000-0000-4000-8000-000000000003", "extractor": "jsonld",
                  "supersedes": ["%s"] }],
    "flag_conflict": [] }]'::jsonb)$$,
    (select id from public.facts where extractor = 'icecat'),
    (select id from public.facts where extractor = 'jsonld'),
    (select id from public.facts where extractor = 'jsonld')),
  'A corrected reading supersedes the old one'
);
select is(
  (select count(*)::int from public.facts where superseded_by is not null and conflict),
  1,
  'The superseded reading keeps its conflict flag'
);
select is(
  (select array_agg(extractor || ':' || conflict order by extractor) from public.facts where superseded_by is null),
  array['icecat:true', 'jsonld:false'],
  'The current seller reading agrees; the manufacturer fact keeps its history'
);

-- The whole call is atomic: a bad group rolls back the good one.
select throws_ok(
  $$select public.srv_write_facts('[
    {"subject_kind": "product", "subject_id": "c0000000-0000-4000-8000-000000000001", "field": "monitor.diagonal",
     "expected_current": [], "inserts": [{ "value": {"value": 27, "unit": "in"}, "state": "verified",
       "source_id": "d0000000-0000-4000-8000-000000000001", "extractor": "icecat", "supersedes": [] }], "flag_conflict": []},
    {"subject_kind": "product", "subject_id": "c0000000-0000-4000-8000-000000000001", "field": "Bad Field",
     "expected_current": [], "inserts": [{ "value": 1, "state": "verified",
       "source_id": "d0000000-0000-4000-8000-000000000001", "extractor": "icecat", "supersedes": [] }], "flag_conflict": []}
  ]'::jsonb)$$,
  '23514', null,
  'An invalid fact rejects the whole write'
);
select is(
  (select count(*)::int from public.facts where field = 'monitor.diagonal'),
  0,
  'Nothing from the failed call was kept'
);

-- Clients can't call the writer.
set local role authenticated;
select throws_ok(
  $$select public.srv_write_facts('[]'::jsonb)$$,
  '42501', null,
  'Only the server may write facts'
);
reset role;

select * from finish();
rollback;
