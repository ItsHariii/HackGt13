-- T17.2 token bucket and T17.4 RLS audit.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Token bucket ---------------------------------------------------------------------------------------
select is(
  (select allowed from public.srv_take_rate_token('bench_run', 'user:a', 2, 0.5)),
  true, 'The first call takes a token');
select is(
  (select remaining from public.srv_take_rate_token('bench_run', 'user:a', 2, 0.5)),
  0, 'The second call empties a bucket of two');
select results_eq(
  $$select allowed, remaining, retry_after_ms from public.srv_take_rate_token('bench_run', 'user:a', 2, 0.5)$$,
  $$values (false, 0, 2000)$$,
  'An empty bucket refuses and says when one token will be back');
select is(
  (select allowed from public.srv_take_rate_token('bench_run', 'user:b', 2, 0.5)),
  true, 'Subjects have separate buckets');
select is(
  (select allowed from public.srv_take_rate_token('search', 'user:a', 2, 0.5)),
  true, 'Buckets are separate per endpoint');

update internal.rate_limit_buckets set updated_at = now() - interval '3 seconds'
where bucket = 'bench_run' and subject = 'user:a';
select results_eq(
  $$select allowed, remaining from public.srv_take_rate_token('bench_run', 'user:a', 2, 0.5)$$,
  $$values (true, 0)$$,
  'Tokens refill over time');
update internal.rate_limit_buckets set updated_at = now() - interval '1 hour'
where bucket = 'bench_run' and subject = 'user:a';
select is(
  (select remaining from public.srv_take_rate_token('bench_run', 'user:a', 2, 0.5)),
  1, 'Refill stops at capacity');

select throws_ok(
  $$select * from public.srv_take_rate_token('bench_run', 'user:a', 2, 0.5, 3)$$,
  '22023', null, 'A cost above capacity is rejected');

set local role authenticated;
select throws_ok(
  $$select * from public.srv_take_rate_token('bench_run', 'user:a', 1000, 1000)$$,
  '42501', null, 'Clients cannot spend or refill buckets');
reset role;

-- RLS audit ------------------------------------------------------------------------------------------
select is(
  (select coalesce(array_agg(c.oid::regclass::text order by 1), '{}') from pg_class c
   where c.relkind in ('r', 'p') and not c.relrowsecurity
     and c.relnamespace in ('public'::regnamespace, 'greathub'::regnamespace)),
  '{}'::text[],
  'RLS is enabled on every public and greathub table');
select is(
  (select coalesce(array_agg(c.oid::regclass::text order by 1), '{}') from pg_class c
   where c.relkind = 'r' and c.relrowsecurity
     and c.relnamespace in ('public'::regnamespace, 'greathub'::regnamespace, 'internal'::regnamespace)
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid)),
  '{}'::text[],
  'Every RLS table states its policy, even when it is deny-all');
select is(
  (select coalesce(array_agg(format('%s.%s', c.conrelid::regclass, c.conname) order by 1), '{}')
   from pg_constraint c
   where c.contype = 'f'
     and c.connamespace in ('public'::regnamespace, 'greathub'::regnamespace)
     and not exists (
       select 1 from pg_index i
       where i.indrelid = c.conrelid
         and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] @> c.conkey
         and c.conkey @> (i.indkey::int2[])[0:cardinality(c.conkey) - 1])),
  '{}'::text[],
  'Every foreign key has a covering index');

select * from finish();
rollback;
