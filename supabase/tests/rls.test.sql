-- T2.8: RLS on every public table, and user B can neither read nor modify any of user A's rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

-- User A owns one row in every user-scoped table (and server-only tables get a row too).
do $$
declare
  a uuid := '11111111-1111-4111-8111-111111111111';
  plan_id uuid := 'a0000000-0000-4000-8000-000000000001';
  set_id uuid;
  req_id uuid;
  run_id uuid;
  basket_id uuid;
  report_id uuid;
  version_id uuid := gen_random_uuid();
  cred_id uuid;
  diff_id uuid;
  exec_id uuid;
  order_id uuid;
  instrument_id uuid;
  body_hash text := 'sha256:' || repeat('b', 64);
begin
  insert into public.plans (id, user_id, title, brief) values (plan_id, a, 'Home office', 'Build my home office');
  insert into public.requirement_sets (plan_id, version, hash, created_by)
  values (plan_id, 1, 'sha256:' || repeat('1', 64), 'user:' || a) returning id into set_id;
  insert into public.requirements (set_id, requirement_key, spec, importance, provenance_kind)
  values (set_id, 'r_usb_pd', '{"id": "r_usb_pd"}', 'hard', 'user_stated') returning id into req_id;
  insert into public.solver_runs (plan_id, set_id, input_hash, status)
  values (plan_id, set_id, 'sha256:' || repeat('2', 64), 'optimal') returning id into run_id;
  insert into public.baskets (plan_id, solver_run_id, label) values (plan_id, run_id, 'A') returning id into basket_id;
  insert into public.basket_items (basket_id, role, offer_id)
  select basket_id, 'monitor', o.id from public.offers o where o.external_id = 'dm_off_48300';
  insert into public.proof_reports (basket_id, set_id, engine_version, packs, summary, report, hash, evaluated_at)
  values (basket_id, set_id, '1.0.0', '{}', '{}', '{}', 'sha256:' || repeat('3', 64), now()) returning id into report_id;
  insert into public.proof_results (report_id, requirement_id, scope, verdict, state)
  values (report_id, req_id, '{"kind": "item"}', 'pass', 'source_stated');
  insert into public.contracts (id, plan_id) values ('b0000000-0000-4000-8000-000000000001', plan_id);
  insert into public.contract_versions (id, contract_id, plan_id, version, basket_id, proof_report_id, body, body_hash, status, autonomy, expires_at)
  values (version_id, 'b0000000-0000-4000-8000-000000000001', plan_id, 1, basket_id, report_id,
    '{"economics": {"currency": "USD", "maxTotalMinor": 91000}}', body_hash, 'awaiting_signature', '{}', now() + interval '15 minutes');
  insert into public.signing_credentials (user_id, credential_id, public_key) values (a, 'cred-a', '\x01') returning id into cred_id;
  insert into public.signing_challenges (nonce, user_id, contract_version_id, body_hash, challenge)
  values (repeat('n', 32), a, version_id, body_hash, 'pc1:challenge');
  insert into public.contract_signatures (contract_version_id, credential_id, credential_public_key, body_hash, challenge,
    authenticator_data, client_data_json, signature, verified_at)
  values (version_id, cred_id, '\x01', body_hash, 'pc1:challenge', '\x02', '\x03', '\x04', now());
  perform internal.transition_contract(version_id, 'signed', 'user:' || a, 'contract.signed');
  insert into public.mandates (contract_version_id, trigger, not_after)
  values (version_id, '{"type": "price_lte", "sku": "U2727", "amountMinor": 32000}', now() + interval '2 days');
  insert into public.checkout_snapshots (contract_version_id, merchant_id, acp_session_id, state, state_hash)
  values (version_id, 'demomart', 'cs_test', '{}', 'sha256:' || repeat('4', 64));
  insert into public.consent_diffs (contract_version_id, classification, current_total_minor)
  values (version_id, 'identical', 89605) returning id into diff_id;
  insert into public.payment_instruments (user_id, rail, rail_ref, brand, last4)
  values (a, 'visa_acceptance', 'tms_pi_1', 'visa', '1111') returning id into instrument_id;
  exec_id := internal.begin_execution(version_id, 'idem-rls-fixture', diff_id, 'visa_acceptance', instrument_id);
  perform internal.consume_execution_token(exec_id);
  perform internal.complete_execution(exec_id, 'authorized', 'txn_1', null, 'demomart', 'dm_ord_1');
  select id into order_id from public.orders where execution_id = exec_id;
  insert into public.evidence_packs (order_id, storage_path, sha256) values (order_id, a || '/pack.zip', 'sha256:' || repeat('5', 64));
  insert into public.webhook_events (provider, event_id, event_type, payload) values ('demomart', 'evt_1', 'order_created', '{}');
  insert into public.ai_calls (plan_id, task, provider, model) values (plan_id, 'A1', 'openai', 'gpt-6-luna');
  insert into public.search_queries (query_hash, query) values ('sha256:' || repeat('6', 64), '{"q": "monitor"}');
  -- Catalog rows the seed leaves empty.
  insert into public.sources (id, url, source_type, content_hash)
  values ('d0000000-0000-4000-8000-000000000001', 'http://localhost:3001/p/vireo-u2727', 'json_ld', 'sha256:' || repeat('7', 64));
  insert into public.facts (subject_kind, subject_id, field, value, unit, state, source_id, extractor)
  select 'product', p.id, 'monitor.usb_c_pd_watts', '90', 'W', 'source_stated', 'd0000000-0000-4000-8000-000000000001', 'jsonld'
  from public.products p where p.external_id = 'U2727';
  insert into public.bench_runs (git_sha, results, passed, total) values ('abc1234', '[]', 0, 0);
end;
$$;

-- Readable by anyone (Explore works before sign-in); everything else is user-owned or server-only.
create temp table catalog_tables (name text primary key);
insert into catalog_tables values ('sources'), ('products'), ('offers'), ('facts'), ('product_external_refs'),
  ('kits'), ('kit_requirements'), ('kit_items'), ('bench_runs');
create temp table server_only_tables (name text primary key);
insert into server_only_tables values ('signing_challenges'), ('webhook_events'), ('ai_calls'), ('search_queries');
grant select on catalog_tables, server_only_tables to authenticated, anon;

-- Visible row count for the current role, or -1 when the role has no privilege at all.
create function pg_temp.visible(p_table text) returns integer language plpgsql as $$
declare
  n integer;
begin
  execute format('select count(*) from public.%I', p_table) into n;
  return n;
exception when insufficient_privilege then
  return -1;
end;
$$;

-- Tables where the current role changed at least one row with UPDATE/DELETE.
create function pg_temp.writable(p_op text) returns text[] language plpgsql as $$
declare
  t record;
  n integer;
  out text[] := '{}';
begin
  for t in
    select c.relname as name, (
      select a.attname from pg_attribute a
      where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attidentity = ''
      order by a.attnum limit 1
    ) as col
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  loop
    begin
      if p_op = 'update' then
        execute format('update public.%I set %I = %I', t.name, t.col, t.col);
      else
        execute format('delete from public.%I', t.name);
      end if;
      get diagnostics n = row_count;
      if n > 0 then
        out := out || t.name::text;
      end if;
    exception when insufficient_privilege then
      null;
    when others then
      -- A constraint or trigger stopping the write still means rows were reachable.
      out := out || (t.name || ':' || sqlstate)::text;
    end;
  end loop;
  return out;
end;
$$;

select is(
  (select coalesce(array_agg(relname::text order by relname), '{}') from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity),
  '{}'::text[],
  'RLS is enabled on every public table'
);

-- User A sees their own rows ------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select coalesce(array_agg(relname::text order by relname), '{}') from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r'
     and relname not like 'foundation_%'
     and relname not in (select name from server_only_tables)
     and pg_temp.visible(relname) <= 0),
  '{}'::text[],
  'The owner can read their row in every user-owned and catalog table'
);
select is(
  (select coalesce(array_agg(name order by name), '{}') from server_only_tables where pg_temp.visible(name) <> -1),
  '{}'::text[],
  'Server-only tables are closed even to the owner'
);
select throws_ok(
  $$select public.srv_begin_execution(gen_random_uuid(), 'idem-client-call', gen_random_uuid())$$,
  '42501', null, 'Clients cannot call the guard wrappers'
);
select throws_ok(
  $$select internal.verify_ledger('a0000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'The internal schema is not reachable by clients'
);
reset role;

-- User B sees and changes nothing of A's ----------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select coalesce(array_agg(relname::text order by relname), '{}') from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r'
     and relname not in (select name from catalog_tables) and relname <> 'profiles'
     and pg_temp.visible(relname) > 0),
  '{}'::text[],
  'User B reads zero rows from every non-catalog table'
);
select is(
  (select array_agg(user_id::text) from public.profiles),
  array['22222222-2222-4222-8222-222222222222'],
  'User B sees only their own profile'
);
select is(pg_temp.writable('update'), '{}'::text[], 'User B updates zero rows in every table');
select is(pg_temp.writable('delete'), '{}'::text[], 'User B deletes zero rows in every table');
update public.plans set title = 'pwned' where id = 'a0000000-0000-4000-8000-000000000001';
select throws_ok(
  $$insert into public.requirement_sets (plan_id, version, hash, created_by)
    values ('a0000000-0000-4000-8000-000000000001', 2, 'sha256:' || repeat('9', 64), 'user:x')$$,
  '42501', null, 'User B cannot add a requirement set to A''s plan'
);
select throws_ok(
  $$insert into public.plans (user_id, title) values ('11111111-1111-4111-8111-111111111111', 'Forged')$$,
  '42501', null, 'User B cannot create a plan owned by A'
);
select throws_ok(
  $$insert into public.products (source, title) values ('demomart', 'Injected')$$,
  '42501', null, 'Clients cannot write the catalog'
);
reset role;
select is((select title from public.plans where id = 'a0000000-0000-4000-8000-000000000001'), 'Home office',
  'A''s plan title is unchanged after B''s update attempt');

-- Anonymous visitors: catalog yes, user data no ---------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select ok((select count(*) from public.products) >= 60, 'Anonymous visitors can browse the catalog');
select is(
  (select coalesce(array_agg(relname::text order by relname), '{}') from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r'
     and relname not in (select name from catalog_tables)
     and pg_temp.visible(relname) > 0),
  '{}'::text[],
  'Anonymous visitors read nothing outside the catalog'
);
reset role;

select * from finish();
rollback;
