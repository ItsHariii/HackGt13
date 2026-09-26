-- T2.6: hash-chained, append-only ledger.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id) values ('11111111-1111-4111-8111-111111111111');
insert into public.plans (id, user_id, title)
values ('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Ledger test');

select lives_ok(
  $$select internal.ledger_append('a0000000-0000-4000-8000-000000000001', 'system', 'plan.created', jsonb_build_object('i', i))
    from generate_series(1, 100) as i$$,
  'Append 100 events'
);
select is((select count(*)::int from public.ledger_events where plan_id = 'a0000000-0000-4000-8000-000000000001'), 100, '100 events stored');
select is(
  (select array_agg(seq order by seq) from public.ledger_events where plan_id = 'a0000000-0000-4000-8000-000000000001'),
  (select array_agg(i::bigint order by i) from generate_series(1, 100) as i),
  'seq runs 1..100 with no gaps'
);
select is(
  (select prev_hash from public.ledger_events where plan_id = 'a0000000-0000-4000-8000-000000000001' and seq = 1),
  repeat('0', 64),
  'First event chains from the zero hash'
);
select is(internal.verify_ledger('a0000000-0000-4000-8000-000000000001'), null::bigint, 'Intact chain verifies (null)');

select throws_ok(
  $$update public.ledger_events set payload = '{"x": 1}' where seq = 5$$,
  '42501', 'ledger_events is append-only', 'UPDATE is blocked by trigger even for the owner'
);
select throws_ok(
  $$delete from public.ledger_events where seq = 5$$,
  '42501', 'ledger_events is append-only', 'DELETE is blocked by trigger even for the owner'
);
select throws_ok($$truncate public.ledger_events$$, '42501', 'ledger_events is append-only', 'TRUNCATE is blocked');

set local role service_role;
select throws_ok(
  $$update public.ledger_events set payload = '{}' where seq = 5$$,
  '42501', null, 'The secret key has no UPDATE privilege'
);
select throws_ok(
  $$insert into public.ledger_events (plan_id, seq, actor, type, prev_hash, hash)
    values ('a0000000-0000-4000-8000-000000000001', 1, 'system', 'plan.created', repeat('0', 64), repeat('0', 64))$$,
  '42501', null, 'The secret key cannot insert directly, only through ledger_append'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.ledger_events), 100, 'Owner reads their ledger');
reset role;

-- Tamper as the table owner with the guard trigger off, then verify finds the exact row.
alter table public.ledger_events disable trigger ledger_immutable;
update public.ledger_events set payload = '{"i": 4200}'
where plan_id = 'a0000000-0000-4000-8000-000000000001' and seq = 42;
alter table public.ledger_events enable trigger ledger_immutable;
select is(internal.verify_ledger('a0000000-0000-4000-8000-000000000001'), 42::bigint, 'Tampered payload is reported at seq 42');

alter table public.ledger_events disable trigger ledger_immutable;
update public.ledger_events set payload = '{"i": 42}'
where plan_id = 'a0000000-0000-4000-8000-000000000001' and seq = 42;
delete from public.ledger_events where plan_id = 'a0000000-0000-4000-8000-000000000001' and seq = 70;
alter table public.ledger_events enable trigger ledger_immutable;
select is(internal.verify_ledger('a0000000-0000-4000-8000-000000000001'), 71::bigint, 'A deleted event breaks the chain at the next seq');

select * from finish();
rollback;
