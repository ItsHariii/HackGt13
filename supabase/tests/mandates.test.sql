-- T14.1 and the worker's bookkeeping: arm from the signed body, cancel, fire once, settle.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id) values ('22222222-2222-4222-8222-222222222222');
insert into public.plans (id, user_id, title)
values ('a1000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Mandates');
insert into public.signing_credentials (id, user_id, credential_id, public_key)
values ('c1000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'cred-m', '\x01');

-- Three signed contracts: 1 and 2 carry a mandate, 3 is a one-time purchase.
do $$
declare
  i int;
  v uuid;
  body jsonb;
begin
  for i in 1..3 loop
    insert into public.contracts (id, plan_id)
    values (('b100000' || i || '-0000-4000-8000-000000000001')::uuid, 'a1000000-0000-4000-8000-000000000001');
    body := jsonb_build_object('economics', jsonb_build_object('maxTotalMinor', 91000),
      'mandate', case when i < 3 then jsonb_build_object(
        'trigger', jsonb_build_object('type', 'price_lte', 'sku', 'U2727', 'amountMinor', 32000),
        'notAfter', to_char((now() + interval '1 day') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
      else 'null'::jsonb end);
    insert into public.contract_versions (id, contract_id, plan_id, version, body, body_hash, status, autonomy, expires_at)
    values (('f100000' || i || '-0000-4000-8000-000000000001')::uuid, ('b100000' || i || '-0000-4000-8000-000000000001')::uuid,
      'a1000000-0000-4000-8000-000000000001', 1, body, 'sha256:' || repeat(i::text, 64), 'awaiting_signature', '{}',
      now() + interval '2 days')
    returning id into v;
    insert into public.contract_signatures (contract_version_id, credential_id, credential_public_key, body_hash, challenge,
      authenticator_data, client_data_json, signature, verified_at)
    values (v, 'c1000000-0000-4000-8000-000000000001', '\x01', 'sha256:' || repeat(i::text, 64), 'c', '\x02', '\x03', '\x04', now());
    perform internal.transition_contract(v, 'signed', 'user:22222222-2222-4222-8222-222222222222', 'contract.signed');
  end loop;
end;
$$;

set local role authenticated;
select throws_ok($$select public.srv_arm_mandate('f1000001-0000-4000-8000-000000000001', 'user:x')$$, '42501', null,
  'Clients cannot arm mandates directly');
reset role;

select is(
  (select m.trigger || jsonb_build_object('status', m.status)
   from public.srv_arm_mandate('f1000001-0000-4000-8000-000000000001', 'user:22222222-2222-4222-8222-222222222222') m),
  '{"type": "price_lte", "sku": "U2727", "amountMinor": 32000, "status": "armed"}'::jsonb,
  'Arming copies the trigger from the signed body'
);
select is((select status::text from public.contract_versions where id = 'f1000001-0000-4000-8000-000000000001'), 'armed',
  'The contract moves signed -> armed');
select is(
  (select id from public.srv_arm_mandate('f1000001-0000-4000-8000-000000000001', 'user:x')),
  (select id from public.mandates where contract_version_id = 'f1000001-0000-4000-8000-000000000001'),
  'Arming again returns the same mandate'
);
select throws_ok($$select public.srv_arm_mandate('f1000003-0000-4000-8000-000000000001', 'user:x')$$, 'mandate_missing',
  'A contract without a signed mandate cannot be armed');
select ok(
  exists (select 1 from public.ledger_events where plan_id = 'a1000000-0000-4000-8000-000000000001' and type = 'mandate.armed'),
  'mandate.armed is in the ledger'
);

-- Cancel: back to signed; the same signature can't be re-armed.
select is(
  (select status::text from public.srv_cancel_mandate(
    (select id from public.mandates where contract_version_id = 'f1000001-0000-4000-8000-000000000001'), 'user:x')),
  'cancelled', 'Cancelling marks the mandate cancelled'
);
select is((select status::text from public.contract_versions where id = 'f1000001-0000-4000-8000-000000000001'), 'signed',
  'The contract returns to signed');
select throws_ok($$select public.srv_arm_mandate('f1000001-0000-4000-8000-000000000001', 'user:x')$$, 'mandate_already_used',
  'A cancelled mandate is not re-armed');

-- Fire and settle.
select lives_ok($$select public.srv_arm_mandate('f1000002-0000-4000-8000-000000000001', 'user:x')$$, 'Second mandate armed');
select is(
  (select next_check_at > now() - interval '1 second' from public.srv_record_mandate(
    (select id from public.mandates where contract_version_id = 'f1000002-0000-4000-8000-000000000001'), 'checked',
    '{"priceMinor": 32900}')),
  true, 'A check that did not fire is due again at the next tick'
);
select lives_ok($$
  select public.srv_record_mandate(
    (select id from public.mandates where contract_version_id = 'f1000002-0000-4000-8000-000000000001'), 'fired',
    '{"priceMinor": 31900}');
  select public.srv_record_mandate(
    (select id from public.mandates where contract_version_id = 'f1000002-0000-4000-8000-000000000001'), 'fired',
    '{"priceMinor": 31900}');
$$, 'Firing twice is safe');
select is(
  (select array_agg(actor || ' ' || type order by seq) from public.ledger_events
   where plan_id = 'a1000000-0000-4000-8000-000000000001' and type = 'mandate.fired'),
  array['system:mandate mandate.fired'], 'mandate.fired is recorded once, by system:mandate'
);
select throws_ok($$
  select public.srv_record_mandate(
    (select id from public.mandates where contract_version_id = 'f1000002-0000-4000-8000-000000000001'), 'settled', '{}', 'armed')
$$, 'mandate_status_invalid', 'Settling needs a final status');
select is(
  (select status::text || '/' || (outcome ->> 'status') from public.srv_record_mandate(
    (select id from public.mandates where contract_version_id = 'f1000002-0000-4000-8000-000000000001'), 'settled', '{}',
    'fired_blocked', '{"status": "no_instrument"}')),
  'fired_blocked/no_instrument', 'Settling records the outcome'
);
select is((select status::text from public.contract_versions where id = 'f1000002-0000-4000-8000-000000000001'), 'signed',
  'A mandate that never reached checkout leaves the contract signed');
select is(internal.verify_ledger('a1000000-0000-4000-8000-000000000001'), null::bigint, 'The ledger chain verifies');

select * from finish();
rollback;
