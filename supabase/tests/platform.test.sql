-- T2.9–T2.11 and T2.12: Realtime triggers, queues, cron, Vault, storage and the GreatHub schema.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select is(
  (select array_agg(queue_name::text order by queue_name) from pgmq.list_queues()),
  array['q_evidence_pack', 'q_evidence_pack_dlq', 'q_fact_refresh', 'q_fact_refresh_dlq',
        'q_mandate_eval', 'q_mandate_eval_dlq', 'q_webhooks', 'q_webhooks_dlq'],
  'Queues and dead-letter queues exist'
);
select is(
  (select array_agg(jobname::text || '@' || schedule order by jobname) from cron.job),
  array['greathub-idempotency-gc@17 * * * *', 'ledger-audit@17 3 * * *', 'mandates-tick@15 seconds', 'nonce-gc@*/10 * * * *', 'offers-refresh@* * * * *', 'rate-limit-gc@41 * * * *'],
  'Cron jobs scheduled'
);
select is(
  (select array_agg(name order by name) from vault.secrets where name in ('worker_url', 'worker_hmac_secret')),
  array['worker_hmac_secret', 'worker_url'],
  'Vault secrets exist'
);
select is(internal.wake_worker('mandate_eval'), null::bigint, 'No wake-up is sent while the worker is unconfigured');
select is(
  (select array_agg(id || ':' || public::text order by id) from storage.buckets
   where id in ('sources', 'evidence-packs', 'product-images')),
  array['evidence-packs:false', 'product-images:true', 'sources:false'],
  'Buckets exist with the right visibility'
);
select is(
  (select array_agg(tgname::text order by tgname) from pg_trigger
   where tgname in ('proof_results_broadcast', 'consent_diffs_broadcast', 'ledger_broadcast', 'contract_status_broadcast')),
  array['consent_diffs_broadcast', 'contract_status_broadcast', 'ledger_broadcast', 'proof_results_broadcast'],
  'Broadcast triggers installed'
);

-- Mandate tick: one due mandate is queued, one lapsed mandate expires its contract.
insert into auth.users (id) values ('11111111-1111-4111-8111-111111111111');
insert into public.plans (id, user_id, title)
values ('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Mandates');
insert into public.contracts (id, plan_id) values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001');
insert into public.signing_credentials (id, user_id, credential_id, public_key)
values ('c0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'cred-a', '\x01');
do $$
declare
  v uuid;
  i int;
begin
  for i in 1..2 loop
    insert into public.contract_versions (contract_id, plan_id, version, body, body_hash, status, autonomy, expires_at)
    values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', i,
      '{"economics": {"maxTotalMinor": 91000}}', 'sha256:' || repeat(i::text, 64), 'awaiting_signature', '{}', now() + interval '2 days')
    returning id into v;
    insert into public.contract_signatures (contract_version_id, credential_id, credential_public_key, body_hash, challenge,
      authenticator_data, client_data_json, signature, verified_at)
    values (v, 'c0000000-0000-4000-8000-000000000001', '\x01', 'sha256:' || repeat(i::text, 64), 'c', '\x02', '\x03', '\x04', now());
    -- Bypass supersession so both versions stay armed for this test.
    update public.contract_versions set status = 'signed' where id = v;
    update public.contract_versions set status = 'armed' where id = v;
    insert into public.mandates (contract_version_id, trigger, not_after, next_check_at)
    values (v, '{"type": "price_lte", "sku": "U2727", "amountMinor": 32000}',
      case i when 1 then now() + interval '1 day' else now() - interval '1 minute' end, now() - interval '1 second');
  end loop;
end;
$$;
select is(internal.mandates_tick(), 1, 'One due mandate enqueued');
select is((select count(*)::int from pgmq.q_q_mandate_eval), 1, 'Message is on q_mandate_eval');
select is(
  (select array_agg(m.status::text || '/' || v.status::text order by v.version)
   from public.mandates m join public.contract_versions v on v.id = m.contract_version_id),
  array['armed/armed', 'expired/expired'],
  'Lapsed mandate and its contract expire'
);
select is(internal.mandates_tick(), 0, 'A queued mandate is not re-enqueued inside its visibility window');

-- Offers in a live contract whose facts are going stale get queued for refresh.
insert into public.baskets (id, plan_id, label) values ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'A');
insert into public.basket_items (basket_id, role, offer_id)
select 'e0000000-0000-4000-8000-000000000001', 'monitor', id from public.offers where external_id = 'dm_off_48300';
insert into public.contracts (id, plan_id) values ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001');
insert into public.contract_versions (id, contract_id, plan_id, version, basket_id, body, body_hash, status, autonomy, expires_at)
values ('f0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 1,
  'e0000000-0000-4000-8000-000000000001', '{"economics": {"maxTotalMinor": 91000}}', 'sha256:' || repeat('f', 64),
  'awaiting_signature', '{}', now() + interval '15 minutes');
insert into public.contract_signatures (contract_version_id, credential_id, credential_public_key, body_hash, challenge,
  authenticator_data, client_data_json, signature, verified_at)
values ('f0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', '\x01', 'sha256:' || repeat('f', 64), 'c',
  '\x02', '\x03', '\x04', now());
update public.contract_versions set status = 'signed' where id = 'f0000000-0000-4000-8000-000000000001';
select is(internal.offers_refresh(), 1, 'Stale offer in a signed contract is queued for refresh');

set local role service_role;
select is((select count(*)::int from public.srv_queue_read('q_mandate_eval', 60, 10)), 1, 'The worker reads the queue');
select throws_ok($$select public.srv_queue_read('pgmq_internal', 60, 10)$$, 'unknown_queue: pgmq_internal', 'Only known queues');
select ok((select count(*) from greathub.products) > 0, 'The GreatHub server key reaches the greathub schema');
reset role;

set local role authenticated;
select throws_ok($$select count(*) from greathub.products$$, '42501', null, 'Clients cannot reach the greathub schema');
reset role;
set local role anon;
select throws_ok($$select count(*) from greathub.offers$$, '42501', null, 'Anonymous visitors cannot reach the greathub schema');
reset role;

select * from finish();
rollback;
