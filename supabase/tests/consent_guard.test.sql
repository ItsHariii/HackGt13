-- T2.4 contract state machine and T2.7 payment guard: one assertion per rejection code.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users (id) values ('11111111-1111-4111-8111-111111111111');
insert into public.plans (id, user_id, title)
values ('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Guard test');
insert into public.signing_credentials (id, user_id, credential_id, public_key)
values ('c0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'cred-a', '\x01');

-- A contract version in awaiting_signature (and signed when p_sign). maxTotal $910.00.
create function pg_temp.version(p_contract uuid, p_version int, p_sign boolean, p_expires timestamptz default now() + interval '15 minutes')
returns uuid language plpgsql as $$
declare
  v_id uuid := gen_random_uuid();
  v_hash text := 'sha256:' || encode(extensions.digest(v_id::text, 'sha256'), 'hex');
begin
  insert into public.contracts (id, plan_id) values (p_contract, 'a0000000-0000-4000-8000-000000000001')
  on conflict (id) do nothing;
  insert into public.contract_versions (id, contract_id, plan_id, version, body, body_hash, status, autonomy, expires_at)
  values (v_id, p_contract, 'a0000000-0000-4000-8000-000000000001', p_version,
    '{"economics": {"currency": "USD", "maxTotalMinor": 91000}, "merchants": [{"id": "demomart"}]}',
    v_hash, 'awaiting_signature', '{"preset": "balanced"}', p_expires);
  if p_sign then
    insert into public.contract_signatures (contract_version_id, credential_id, credential_public_key, body_hash, challenge,
      authenticator_data, client_data_json, signature, verified_at)
    values (v_id, 'c0000000-0000-4000-8000-000000000001', '\x01', v_hash, 'pc1:' || v_hash || ':nonce',
      '\x02', '\x03', '\x04', now());
    perform internal.transition_contract(v_id, 'signed', 'user:11111111-1111-4111-8111-111111111111', 'contract.signed');
  end if;
  return v_id;
end;
$$;

create function pg_temp.diff(p_version uuid, p_class public.diff_classification, p_total bigint, p_age interval default '0 seconds')
returns uuid language sql as $$
  insert into public.consent_diffs (contract_version_id, classification, current_total_minor, created_at)
  values (p_version, p_class, p_total, now() - p_age)
  returning id;
$$;

-- State machine ---------------------------------------------------------------------------------
select is((select count(*)::int from internal.contract_transitions), 15, 'Transition table seeded from SDD §7.5');

select throws_ok(
  $$insert into public.contract_versions (contract_id, plan_id, version, body, body_hash, status, autonomy, expires_at)
    select gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', 1, '{"economics": {"maxTotalMinor": 1}}',
      'sha256:' || repeat('a', 64), 'executing', '{}', now()$$,
  '23514', null, 'A version cannot be created in an executing state'
);

create temp table t (name text primary key, id uuid);
insert into t values ('unsigned', pg_temp.version('b0000000-0000-4000-8000-000000000001', 1, false));
select throws_ok(
  $$update public.contract_versions set status = 'signed' where id = (select id from t where name = 'unsigned')$$,
  '23514', 'signature_missing', 'Cannot reach signed without a verified signature over the body hash'
);

insert into t values ('v1', pg_temp.version('b0000000-0000-4000-8000-000000000002', 1, true));
select is((select status::text from public.contract_versions where id = (select id from t where name = 'v1')), 'signed', 'Signed with a verified signature');
select isnt((select signed_at from public.contract_versions where id = (select id from t where name = 'v1')), null, 'signed_at stamped');

select throws_ok(
  $$update public.contract_versions set body = '{"economics": {"maxTotalMinor": 99999999}}' where id = (select id from t where name = 'v1')$$,
  '23514', null, 'A signed body can never change'
);

select lives_ok(
  $$select internal.transition_contract((select id from t where name = 'v1'), 'invalidated', 'system', 'execution.blocked')$$,
  'signed -> invalidated'
);
select throws_ok(
  $$update public.contract_versions set status = 'executing' where id = (select id from t where name = 'v1')$$,
  '23514', 'illegal_contract_transition: invalidated -> executing', 'Direct invalidated -> executing is rejected'
);

select id as v1_id from t where name = 'v1' \gset
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  format($$update public.contract_versions set status = 'superseded' where id = %L$$, :'v1_id'),
  '42501', null, 'Clients cannot write contract status, even their own'
);
reset role;

insert into t values ('v2', pg_temp.version('b0000000-0000-4000-8000-000000000002', 2, true));
select is((select status::text from public.contract_versions where id = (select id from t where name = 'v1')), 'superseded',
  'Signing v2 supersedes the invalidated v1');

-- Guard rejections --------------------------------------------------------------------------------
select throws_ok(
  $$select internal.begin_execution((select id from t where name = 'unsigned'), 'idem-unsigned',
    pg_temp.diff((select id from t where name = 'unsigned'), 'identical', 89605))$$,
  'contract_not_signed', 'contract_not_signed'
);

insert into t values ('expired', pg_temp.version('b0000000-0000-4000-8000-000000000003', 1, true, now() - interval '1 second'));
select throws_ok(
  $$select internal.begin_execution((select id from t where name = 'expired'), 'idem-expired',
    pg_temp.diff((select id from t where name = 'expired'), 'identical', 89605))$$,
  'contract_expired', 'contract_expired'
);

insert into t values ('old', pg_temp.version('b0000000-0000-4000-8000-000000000004', 1, true));
select pg_temp.version('b0000000-0000-4000-8000-000000000004', 2, false);
select throws_ok(
  $$select internal.begin_execution((select id from t where name = 'old'), 'idem-superseded',
    pg_temp.diff((select id from t where name = 'old'), 'identical', 89605))$$,
  'contract_superseded', 'contract_superseded'
);

insert into t values ('nosig', pg_temp.version('b0000000-0000-4000-8000-000000000005', 1, true));
delete from public.contract_signatures where contract_version_id = (select id from t where name = 'nosig');
select throws_ok(
  $$select internal.begin_execution((select id from t where name = 'nosig'), 'idem-nosig',
    pg_temp.diff((select id from t where name = 'nosig'), 'identical', 89605))$$,
  'signature_missing', 'signature_missing'
);

insert into t values ('ok', pg_temp.version('b0000000-0000-4000-8000-000000000006', 1, true));
select throws_ok(
  $$select internal.begin_execution((select id from t where name = 'ok'), 'idem-nodiff', gen_random_uuid())$$,
  'diff_missing', 'diff_missing'
);
select throws_ok(
  $$select internal.begin_execution((select id from t where name = 'ok'), 'idem-material',
    pg_temp.diff((select id from t where name = 'ok'), 'reapprove', 89605))$$,
  'material_change', 'material_change (reapprove)'
);
select throws_ok(
  $$select internal.begin_execution((select id from t where name = 'ok'), 'idem-block',
    pg_temp.diff((select id from t where name = 'ok'), 'block', 88107))$$,
  'material_change', 'material_change (block)'
);
select throws_ok(
  $$select internal.begin_execution((select id from t where name = 'ok'), 'idem-stale',
    pg_temp.diff((select id from t where name = 'ok'), 'identical', 89605, interval '91 seconds'))$$,
  'stale_reproof', 'stale_reproof'
);
select throws_ok(
  $$select internal.begin_execution((select id from t where name = 'ok'), 'idem-over',
    pg_temp.diff((select id from t where name = 'ok'), 'auto', 91001))$$,
  'over_max_total', 'over_max_total'
);
select is((select count(*)::int from public.payment_executions), 0, 'No rejected call created an execution');

-- Happy path, replay and single-use token ---------------------------------------------------------
insert into t values ('exec', internal.begin_execution((select id from t where name = 'ok'), 'idem-happy-path',
  pg_temp.diff((select id from t where name = 'ok'), 'auto', 89177)));
select is((select status::text from public.contract_versions where id = (select id from t where name = 'ok')), 'executing',
  'begin_execution moves the contract to executing');
select is(
  internal.begin_execution((select id from t where name = 'ok'), 'idem-happy-path', gen_random_uuid()),
  (select id from t where name = 'exec'),
  'Replaying the idempotency key returns the same execution'
);
select throws_ok(
  $$select internal.begin_execution((select id from t where name = 'ok'), 'idem-second-attempt',
    pg_temp.diff((select id from t where name = 'ok'), 'identical', 89177))$$,
  'contract_not_signed', 'A second key cannot start another payment while one is in flight'
);
select throws_ok(
  $$select internal.begin_execution((select id from t where name = 'v2'), 'idem-happy-path',
    pg_temp.diff((select id from t where name = 'v2'), 'identical', 89177))$$,
  'idempotency_key_reused', 'An idempotency key is bound to one contract version'
);
select throws_ok(
  $$select internal.complete_execution((select id from t where name = 'exec'), 'authorized')$$,
  'execution_token_not_consumed', 'Cannot record a payment the rail never consumed a token for'
);
select lives_ok($$select internal.consume_execution_token((select id from t where name = 'exec'))$$, 'Token consumed once');
select throws_ok(
  $$select internal.consume_execution_token((select id from t where name = 'exec'))$$,
  'execution_token_consumed', 'A second consumption fails'
);

select internal.complete_execution((select id from t where name = 'exec'), 'authorized', 'txn_123', null, 'demomart', 'dm_ord_1');
select is(
  (select status::text from public.contract_versions where id = (select id from t where name = 'ok')) || '/'
    || (select status::text from public.orders where merchant_order_id = 'dm_ord_1'),
  'executed/created',
  'Authorized payment: contract executed and order created'
);

-- Declined, then a user-approved retry with a new key and a fresh diff.
insert into t values ('exec2', internal.begin_execution((select id from t where name = 'v2'), 'idem-v2-first',
  pg_temp.diff((select id from t where name = 'v2'), 'identical', 87037)));
select internal.consume_execution_token((select id from t where name = 'exec2'));
select internal.complete_execution((select id from t where name = 'exec2'), 'declined', null, '{"reason": "DECLINED"}');
select lives_ok(
  $$select internal.begin_execution((select id from t where name = 'v2'), 'idem-v2-retry',
    pg_temp.diff((select id from t where name = 'v2'), 'identical', 87037))$$,
  'failed -> executing retry with a new key'
);

select is(internal.verify_ledger('a0000000-0000-4000-8000-000000000001'), null::bigint, 'Ledger chain intact after the whole flow');

-- Privacy (SDD §20.3): deleting a plan cascades through paid executions; the ledger stays.
select lives_ok(
  $$delete from public.plans where id = 'a0000000-0000-4000-8000-000000000001'$$,
  'Deleting a plan cascades through contracts, diffs, executions and orders'
);
select ok(
  (select count(*) from public.ledger_events where plan_id = 'a0000000-0000-4000-8000-000000000001') > 0
    and internal.verify_ledger('a0000000-0000-4000-8000-000000000001') is null,
  'Its ledger events remain and still verify'
);

select * from finish();
rollback;
