-- T12.1–T12.3 passkey signing: challenge lifecycle and the signing transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id) values
  ('12000000-0000-4000-8000-000000000001'), ('12000000-0000-4000-8000-000000000002');
insert into public.plans (id, user_id, title)
values ('a1200000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', 'Signing test');
insert into public.contracts (id, plan_id) values
  ('b1200000-0000-4000-8000-000000000001', 'a1200000-0000-4000-8000-000000000001'),
  ('b1200000-0000-4000-8000-000000000002', 'a1200000-0000-4000-8000-000000000001'),
  ('b1200000-0000-4000-8000-000000000003', 'a1200000-0000-4000-8000-000000000001');

create function pg_temp.version(p_id uuid, p_contract uuid, p_version int, p_expires interval default '15 minutes')
returns uuid language sql as $$
  insert into public.contract_versions (id, contract_id, plan_id, version, body, body_hash, status, autonomy, expires_at)
  values (p_id, p_contract, 'a1200000-0000-4000-8000-000000000001', p_version,
    '{"economics": {"currency": "USD", "maxTotalMinor": 91000}}',
    'sha256:' || encode(extensions.digest(p_id::text, 'sha256'), 'hex'), 'awaiting_signature', '{"preset": "balanced"}', now() + p_expires)
  returning id;
$$;
create function pg_temp.h(p_id uuid) returns text language sql as $$
  select 'sha256:' || encode(extensions.digest(p_id::text, 'sha256'), 'hex');
$$;
create function pg_temp.ch(p_id uuid, p_nonce text) returns text language sql as $$
  select 'ct1:' || encode(extensions.digest(p_id::text, 'sha256'), 'hex') || ':' || p_nonce;
$$;

select pg_temp.version('c1200000-0000-4000-8000-000000000001', 'b1200000-0000-4000-8000-000000000001', 1);
select pg_temp.version('c1200000-0000-4000-8000-000000000002', 'b1200000-0000-4000-8000-000000000002', 1);
select pg_temp.version('c1200000-0000-4000-8000-000000000003', 'b1200000-0000-4000-8000-000000000002', 2);
select pg_temp.version('c1200000-0000-4000-8000-000000000004', 'b1200000-0000-4000-8000-000000000003', 1, '-1 minute');

-- Registration challenges --------------------------------------------------------------------------
select public.srv_begin_signing_registration('12000000-0000-4000-8000-000000000001', 'reg-challenge-aaaaaaaa');
select ok(public.srv_consume_signing_registration('12000000-0000-4000-8000-000000000001', 'reg-challenge-aaaaaaaa'),
  'A fresh registration challenge is accepted once');
select ok(not public.srv_consume_signing_registration('12000000-0000-4000-8000-000000000001', 'reg-challenge-aaaaaaaa'),
  'A registration challenge cannot be reused');
select public.srv_begin_signing_registration('12000000-0000-4000-8000-000000000001', 'reg-challenge-bbbbbbbb');
select ok(not public.srv_consume_signing_registration('12000000-0000-4000-8000-000000000002', 'reg-challenge-bbbbbbbb'),
  'Another user cannot consume a registration challenge');
update internal.signing_registration_challenges set expires_at = now() - interval '1 second';
select ok(not public.srv_consume_signing_registration('12000000-0000-4000-8000-000000000001', 'reg-challenge-bbbbbbbb'),
  'An expired registration challenge is rejected');
select is((select count(*)::int from internal.signing_registration_challenges), 0, 'Expired registration challenge is deleted');

-- Signing challenges -------------------------------------------------------------------------------
select throws_ok(
  $$select public.srv_begin_signing('12000000-0000-4000-8000-000000000001', 'c1200000-0000-4000-8000-000000000001',
    pg_temp.h('c1200000-0000-4000-8000-000000000001'), 'nonce-aaaaaaaaaaaaaaaa',
    pg_temp.ch('c1200000-0000-4000-8000-000000000001', 'nonce-aaaaaaaaaaaaaaaa'))$$,
  'signing_key_required', 'Signing needs a registered signing key');

insert into public.signing_credentials (id, user_id, credential_id, public_key) values
  ('d1200000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', 'cred-owner', '\x01'),
  ('d1200000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000002', 'cred-other', '\x02');

select throws_ok(
  $$select public.srv_begin_signing('12000000-0000-4000-8000-000000000002', 'c1200000-0000-4000-8000-000000000001',
    pg_temp.h('c1200000-0000-4000-8000-000000000001'), 'nonce-aaaaaaaaaaaaaaaa',
    pg_temp.ch('c1200000-0000-4000-8000-000000000001', 'nonce-aaaaaaaaaaaaaaaa'))$$,
  'contract_not_found', 'Another user cannot request a challenge for the contract');
select throws_ok(
  $$select public.srv_begin_signing('12000000-0000-4000-8000-000000000001', 'c1200000-0000-4000-8000-000000000001',
    'sha256:' || repeat('0', 64), 'nonce-aaaaaaaaaaaaaaaa', 'ct1:' || repeat('0', 64) || ':nonce-aaaaaaaaaaaaaaaa')$$,
  'body_hash_mismatch', 'The challenge hash must be the stored body hash');
select throws_ok(
  $$select public.srv_begin_signing('12000000-0000-4000-8000-000000000001', 'c1200000-0000-4000-8000-000000000001',
    pg_temp.h('c1200000-0000-4000-8000-000000000001'), 'nonce-aaaaaaaaaaaaaaaa', 'ct1:other')$$,
  'challenge_invalid', 'The challenge must be ct1:{H}:{N}');
select throws_ok(
  $$select public.srv_begin_signing('12000000-0000-4000-8000-000000000001', 'c1200000-0000-4000-8000-000000000002',
    pg_temp.h('c1200000-0000-4000-8000-000000000002'), 'nonce-aaaaaaaaaaaaaaaa',
    pg_temp.ch('c1200000-0000-4000-8000-000000000002', 'nonce-aaaaaaaaaaaaaaaa'))$$,
  'contract_superseded', 'A version with a newer revision cannot be signed');
select throws_ok(
  $$select public.srv_begin_signing('12000000-0000-4000-8000-000000000001', 'c1200000-0000-4000-8000-000000000004',
    pg_temp.h('c1200000-0000-4000-8000-000000000004'), 'nonce-aaaaaaaaaaaaaaaa',
    pg_temp.ch('c1200000-0000-4000-8000-000000000004', 'nonce-aaaaaaaaaaaaaaaa'))$$,
  'contract_expired', 'An expired version cannot be signed');

select ok(public.srv_begin_signing('12000000-0000-4000-8000-000000000001', 'c1200000-0000-4000-8000-000000000001',
    pg_temp.h('c1200000-0000-4000-8000-000000000001'), 'nonce-aaaaaaaaaaaaaaaa',
    pg_temp.ch('c1200000-0000-4000-8000-000000000001', 'nonce-aaaaaaaaaaaaaaaa'))
  between now() + interval '119 seconds' and now() + interval '121 seconds', 'Challenges live for two minutes');

select is(
  (select count(*)::int from public.srv_consume_signing_challenge('12000000-0000-4000-8000-000000000002', 'nonce-aaaaaaaaaaaaaaaa')),
  0, 'Another user cannot consume the challenge');
select results_eq(
  $$select contract_version_id, expired from public.srv_consume_signing_challenge('12000000-0000-4000-8000-000000000001', 'nonce-aaaaaaaaaaaaaaaa')$$,
  $$values ('c1200000-0000-4000-8000-000000000001'::uuid, false)$$, 'The owner consumes a fresh challenge');
select is(
  (select count(*)::int from public.srv_consume_signing_challenge('12000000-0000-4000-8000-000000000001', 'nonce-aaaaaaaaaaaaaaaa')),
  0, 'A consumed challenge cannot be reused');

select public.srv_begin_signing('12000000-0000-4000-8000-000000000001', 'c1200000-0000-4000-8000-000000000001',
  pg_temp.h('c1200000-0000-4000-8000-000000000001'), 'nonce-bbbbbbbbbbbbbbbb',
  pg_temp.ch('c1200000-0000-4000-8000-000000000001', 'nonce-bbbbbbbbbbbbbbbb'));
update public.signing_challenges set expires_at = now() - interval '1 second';
select results_eq(
  $$select expired from public.srv_consume_signing_challenge('12000000-0000-4000-8000-000000000001', 'nonce-bbbbbbbbbbbbbbbb')$$,
  $$values (true)$$, 'An expired challenge reports expired');
select is((select count(*)::int from public.signing_challenges), 0, 'The expired challenge is deleted too');

-- Recording the signature --------------------------------------------------------------------------
select throws_ok(
  $$select public.srv_record_contract_signature('12000000-0000-4000-8000-000000000001', 'c1200000-0000-4000-8000-000000000001',
    pg_temp.h('c1200000-0000-4000-8000-000000000001'), pg_temp.ch('c1200000-0000-4000-8000-000000000001', 'nonce-cccccccccccccccc'),
    'cred-other', '\x02', '\x03', '\x04', 1)$$,
  'credential_not_found', 'Another user''s credential cannot sign');
update public.signing_credentials set counter = 5 where id = 'd1200000-0000-4000-8000-000000000001';
select throws_ok(
  $$select public.srv_record_contract_signature('12000000-0000-4000-8000-000000000001', 'c1200000-0000-4000-8000-000000000001',
    pg_temp.h('c1200000-0000-4000-8000-000000000001'), pg_temp.ch('c1200000-0000-4000-8000-000000000001', 'nonce-cccccccccccccccc'),
    'cred-owner', '\x02', '\x03', '\x04', 5)$$,
  'counter_regressed', 'A signature counter that does not advance is rejected');

select lives_ok(
  $$select public.srv_record_contract_signature('12000000-0000-4000-8000-000000000001', 'c1200000-0000-4000-8000-000000000001',
    pg_temp.h('c1200000-0000-4000-8000-000000000001'), pg_temp.ch('c1200000-0000-4000-8000-000000000001', 'nonce-cccccccccccccccc'),
    'cred-owner', '\x02', '\x03', '\x04', 6)$$,
  'A verified assertion is recorded');
select results_eq(
  $$select v.status::text, s.credential_public_key, c.counter
    from public.contract_versions v
    join public.contract_signatures s on s.contract_version_id = v.id
    join public.signing_credentials c on c.id = s.credential_id
    where v.id = 'c1200000-0000-4000-8000-000000000001'$$,
  $$values ('signed', '\x01'::bytea, 6::bigint)$$,
  'The version is signed with the credential public key stored and the counter advanced');
select is(
  (select payload->>'credentialId' from public.ledger_events
   where plan_id = 'a1200000-0000-4000-8000-000000000001' and type = 'contract.signed'),
  'cred-owner', 'contract.signed is appended to the ledger');
select throws_ok(
  $$select public.srv_record_contract_signature('12000000-0000-4000-8000-000000000001', 'c1200000-0000-4000-8000-000000000001',
    pg_temp.h('c1200000-0000-4000-8000-000000000001'), pg_temp.ch('c1200000-0000-4000-8000-000000000001', 'nonce-dddddddddddddddd'),
    'cred-owner', '\x02', '\x03', '\x04', 7)$$,
  'contract_not_awaiting_signature', 'A signed version cannot be signed again');

-- Server only --------------------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated',
  'public.srv_record_contract_signature(uuid,uuid,text,text,text,bytea,bytea,bytea,bigint)', 'execute'),
  'Clients cannot record signatures');
select ok(not has_function_privilege('authenticated', 'public.srv_begin_signing(uuid,uuid,text,text,text)', 'execute'),
  'Clients cannot mint signing challenges');

select * from finish();
rollback;
