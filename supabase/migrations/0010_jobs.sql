-- Queues, Vault-held worker secrets and scheduled jobs (SDD §14, §19.4).
--
-- Flow: pg_cron -> internal.* enqueues work into pgmq -> pg_net POSTs a wake-up to
-- {worker_url}/api/internal/queue/{name}. The worker drains the queue through the srv_queue_*
-- wrappers, archives on success and moves a message to {queue}_dlq after 5 reads.
--
-- Wake-up auth: headers x-cartel-timestamp (unix seconds) and
-- x-cartel-signature = 'v1=' || hex(hmac_sha256(worker_hmac_secret, '{timestamp}.{queue}')).
-- Only the timestamp and queue name are signed, so body serialization can never break it.
--
-- Vault secrets are created as 'unset'. Configure per environment (never in a migration):
--   select vault.update_secret((select id from vault.secrets where name = 'worker_url'), 'https://…');
--   select vault.update_secret((select id from vault.secrets where name = 'worker_hmac_secret'), '…');
-- Until both are set, jobs still enqueue but skip the wake-up.

select pgmq.create(q) from unnest(array[
  'q_mandate_eval', 'q_mandate_eval_dlq',
  'q_fact_refresh', 'q_fact_refresh_dlq',
  'q_webhooks', 'q_webhooks_dlq',
  'q_evidence_pack', 'q_evidence_pack_dlq'
]) as q;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'worker_url') then
    perform vault.create_secret('unset', 'worker_url', 'Base URL of the Cartel web app that drains queues');
  end if;
  if not exists (select 1 from vault.secrets where name = 'worker_hmac_secret') then
    perform vault.create_secret('unset', 'worker_hmac_secret', 'Must equal INTERNAL_QUEUE_HMAC_SECRET in apps/web');
  end if;
end;
$$;

create table internal.ledger_audit_failures (
  id bigint generated always as identity primary key,
  plan_id uuid not null,
  broken_seq bigint not null,
  detected_at timestamptz not null default now()
);
revoke all on internal.ledger_audit_failures from public, anon, authenticated;

-- Returns the pg_net request id, or null when the worker is not configured.
create or replace function internal.wake_worker(p_queue text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
  v_ts text := extract(epoch from now())::bigint::text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'worker_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'worker_hmac_secret';
  if coalesce(v_url, 'unset') = 'unset' or coalesce(v_secret, 'unset') = 'unset' then
    return null;
  end if;
  return net.http_post(
    url := rtrim(v_url, '/') || '/api/internal/queue/' || p_queue,
    body := jsonb_build_object('queue', p_queue),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cartel-timestamp', v_ts,
      'x-cartel-signature', 'v1=' || encode(extensions.hmac(v_ts || '.' || p_queue, v_secret, 'sha256'), 'hex')
    ),
    timeout_milliseconds := 5000
  );
end;
$$;
revoke all on function internal.wake_worker(text) from public, anon, authenticated;

-- Every 15 s: expire lapsed mandates, enqueue due ones, wake the worker if anything is queued.
create or replace function internal.mandates_tick()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  m record;
  queued integer := 0;
begin
  for m in
    select mandates.id, mandates.contract_version_id, mandates.not_after, v.status as contract_status
    from public.mandates join public.contract_versions v on v.id = mandates.contract_version_id
    where mandates.status = 'armed' and mandates.next_check_at <= now()
    order by mandates.next_check_at
    limit 500
    for update of mandates skip locked
  loop
    if m.not_after <= now() then
      update public.mandates set status = 'expired', last_checked_at = now() where id = m.id;
      if m.contract_status = 'armed' then
        perform internal.transition_contract(m.contract_version_id, 'expired', 'worker:mandates', 'mandate.expired',
          jsonb_build_object('mandateId', m.id));
      end if;
    else
      perform pgmq.send('q_mandate_eval', jsonb_build_object('mandateId', m.id, 'contractVersionId', m.contract_version_id));
      -- Push the next check past the worker's 60 s visibility timeout so a slow run isn't doubled.
      update public.mandates set next_check_at = now() + interval '60 seconds' where id = m.id;
      queued := queued + 1;
    end if;
  end loop;
  if queued > 0 then
    perform internal.wake_worker('mandate_eval');
  end if;
  return queued;
end;
$$;
revoke all on function internal.mandates_tick() from public, anon, authenticated;

-- Every minute: queue offers in live contracts whose facts are about to go stale.
create or replace function internal.offers_refresh()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  queued integer;
begin
  with due as (
    select distinct o.id
    from public.contract_versions v
    join public.basket_items bi on bi.basket_id = v.basket_id
    join public.offers o on o.id = bi.offer_id
    where v.status in ('signed', 'armed') and v.expires_at > now()
      and o.fresh_until < now() + interval '30 seconds'
  )
  select count(*)::integer into queued
  from due cross join lateral pgmq.send('q_fact_refresh', jsonb_build_object('offerId', due.id)) as sent;
  if queued > 0 then
    perform internal.wake_worker('fact_refresh');
  end if;
  return queued;
end;
$$;
revoke all on function internal.offers_refresh() from public, anon, authenticated;

-- Nightly: re-verify every plan's chain and record breaks.
create or replace function internal.ledger_audit()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  p record;
  broken bigint;
  failures integer := 0;
begin
  for p in select distinct plan_id from public.ledger_events loop
    broken := internal.verify_ledger(p.plan_id);
    if broken is not null then
      insert into internal.ledger_audit_failures (plan_id, broken_seq) values (p.plan_id, broken);
      raise warning 'ledger chain broken: plan % at seq %', p.plan_id, broken;
      failures := failures + 1;
    end if;
  end loop;
  return failures;
end;
$$;
revoke all on function internal.ledger_audit() from public, anon, authenticated;

select cron.schedule('mandates-tick', '15 seconds', 'select internal.mandates_tick()');
select cron.schedule('offers-refresh', '* * * * *', 'select internal.offers_refresh()');
select cron.schedule('ledger-audit', '17 3 * * *', 'select internal.ledger_audit()');

-- Worker-side queue access for the secret key, limited to Cartel's queues.
create or replace function internal.assert_queue(p_queue text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_queue not in (
    'q_mandate_eval', 'q_mandate_eval_dlq', 'q_fact_refresh', 'q_fact_refresh_dlq',
    'q_webhooks', 'q_webhooks_dlq', 'q_evidence_pack', 'q_evidence_pack_dlq'
  ) then
    raise exception 'unknown_queue: %', p_queue;
  end if;
end;
$$;
revoke all on function internal.assert_queue(text) from public, anon, authenticated;

create or replace function public.srv_queue_read(p_queue text, p_vt integer default 60, p_qty integer default 10)
returns setof pgmq.message_record language plpgsql security definer set search_path = '' as $$
begin
  perform internal.assert_queue(p_queue);
  return query select * from pgmq.read(p_queue, p_vt, p_qty);
end;
$$;
create or replace function public.srv_queue_send(p_queue text, p_message jsonb, p_delay integer default 0)
returns bigint language plpgsql security definer set search_path = '' as $$
begin
  perform internal.assert_queue(p_queue);
  return (select pgmq.send(p_queue, p_message, p_delay));
end;
$$;
create or replace function public.srv_queue_archive(p_queue text, p_msg_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform internal.assert_queue(p_queue);
  return (select pgmq.archive(p_queue, p_msg_id));
end;
$$;
revoke all on function public.srv_queue_read(text, integer, integer) from public, anon, authenticated;
revoke all on function public.srv_queue_send(text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.srv_queue_archive(text, bigint) from public, anon, authenticated;
grant execute on function public.srv_queue_read(text, integer, integer) to service_role;
grant execute on function public.srv_queue_send(text, jsonb, integer) to service_role;
grant execute on function public.srv_queue_archive(text, bigint) to service_role;

-- The Chaos Panel's "Run mandate tick now" (SDD §14): same function the cron job runs.
create or replace function public.srv_mandates_tick()
returns integer language sql security definer set search_path = '' as $$
  select internal.mandates_tick();
$$;
revoke all on function public.srv_mandates_tick() from public, anon, authenticated;
grant execute on function public.srv_mandates_tick() to service_role;
