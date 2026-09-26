-- The payment guard (SDD §13.5). Every path to money goes through these functions, and each
-- rejection raises an exception whose message is a stable code the API maps to a response.
--
-- Codes: contract_not_found, contract_not_signed, contract_expired, contract_superseded,
-- signature_missing, diff_missing, material_change, stale_reproof, over_max_total,
-- idempotency_key_invalid, idempotency_key_reused, instrument_invalid, execution_not_found,
-- execution_token_consumed, execution_token_not_consumed, execution_already_completed.

create or replace function internal.transition_contract(
  p_version uuid,
  p_to public.contract_status,
  p_actor text default 'system',
  p_event text default null,
  p_payload jsonb default '{}'
) returns public.contract_versions language plpgsql security definer set search_path = '' as $$
declare
  v public.contract_versions;
  older record;
  from_status public.contract_status;
begin
  select * into v from public.contract_versions where id = p_version for update;
  if not found then
    raise exception 'contract_not_found' using detail = p_version::text;
  end if;
  from_status := v.status;

  -- contract_status_guard (0004) rejects anything not in internal.contract_transitions.
  update public.contract_versions set status = p_to where id = p_version returning * into v;

  if p_event is not null then
    perform internal.ledger_append(v.plan_id, p_actor, p_event, coalesce(p_payload, '{}') || jsonb_build_object(
      'contractVersionId', v.id, 'version', v.version, 'bodyHash', v.body_hash, 'from', from_status, 'to', p_to
    ));
  end if;

  -- Signing a revision retires every earlier version still open for signature or invalidated.
  if p_to = 'signed' then
    for older in
      select id, version from public.contract_versions
      where contract_id = v.contract_id and version < v.version
        and status in ('draft', 'awaiting_signature', 'invalidated')
      for update
    loop
      update public.contract_versions set status = 'superseded' where id = older.id;
      perform internal.ledger_append(v.plan_id, p_actor, 'contract.superseded', jsonb_build_object(
        'contractVersionId', older.id, 'version', older.version, 'supersededBy', v.id
      ));
    end loop;
  end if;

  return v;
end;
$$;
revoke all on function internal.transition_contract(uuid, public.contract_status, text, text, jsonb) from public, anon, authenticated;

create or replace function internal.begin_execution(
  p_version uuid,
  p_idem text,
  p_diff uuid,
  p_rail public.payment_rail default null,
  p_instrument uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.contract_versions;
  d public.consent_diffs;
  existing public.payment_executions;
  exec_id uuid;
begin
  if p_idem is null or char_length(p_idem) not between 8 and 255 then
    raise exception 'idempotency_key_invalid';
  end if;

  -- Lock first so a concurrent replay with the same key waits and then sees the first result.
  select * into v from public.contract_versions where id = p_version for update;
  if not found then
    raise exception 'contract_not_found' using detail = p_version::text;
  end if;

  select * into existing from public.payment_executions where idempotency_key = p_idem;
  if found then
    if existing.contract_version_id <> v.id then
      raise exception 'idempotency_key_reused';
    end if;
    return existing.id;
  end if;

  if v.status not in ('signed', 'armed', 'failed') then
    raise exception 'contract_not_signed' using detail = v.status::text;
  end if;
  if v.expires_at <= now() then
    raise exception 'contract_expired';
  end if;
  if exists (
    select 1 from public.contract_versions
    where contract_id = v.contract_id and version > v.version
  ) then
    raise exception 'contract_superseded';
  end if;
  if not exists (
    select 1 from public.contract_signatures s
    where s.contract_version_id = v.id and s.body_hash = v.body_hash and s.verified_at is not null
  ) then
    raise exception 'signature_missing';
  end if;

  select * into d from public.consent_diffs where id = p_diff and contract_version_id = v.id;
  if not found then
    raise exception 'diff_missing';
  end if;
  if d.classification not in ('identical', 'auto') then
    raise exception 'material_change' using detail = d.classification::text;
  end if;
  if d.created_at < now() - interval '90 seconds' then
    raise exception 'stale_reproof';
  end if;
  if d.current_total_minor > (v.body #>> '{economics,maxTotalMinor}')::bigint then
    raise exception 'over_max_total';
  end if;

  if p_instrument is not null and not exists (
    select 1 from public.payment_instruments i
    join public.plans p on p.user_id = i.user_id
    where i.id = p_instrument and p.id = v.plan_id
  ) then
    raise exception 'instrument_invalid';
  end if;

  insert into public.payment_executions (contract_version_id, idempotency_key, diff_id, rail, instrument_id, amount_minor, currency, status)
  values (v.id, p_idem, d.id, p_rail, p_instrument, d.current_total_minor, coalesce(v.body #>> '{economics,currency}', 'USD'), 'started')
  returning id into exec_id;

  update public.contract_versions set status = 'executing' where id = v.id;
  perform internal.ledger_append(v.plan_id, 'system', 'execution.started', jsonb_build_object(
    'executionId', exec_id, 'contractVersionId', v.id, 'diffId', d.id,
    'classification', d.classification, 'amountMinor', d.current_total_minor
  ));
  return exec_id;
end;
$$;
revoke all on function internal.begin_execution(uuid, text, uuid, public.payment_rail, uuid) from public, anon, authenticated;

-- The execution id is the execution token. A rail must consume it before charging; a second
-- consumption fails, so the same approval can never be charged twice.
create or replace function internal.consume_execution_token(p_execution uuid)
returns public.payment_executions language plpgsql security definer set search_path = '' as $$
declare
  e public.payment_executions;
begin
  update public.payment_executions
  set token_consumed_at = now()
  where id = p_execution and token_consumed_at is null and status = 'started'
  returning * into e;
  if not found then
    if exists (select 1 from public.payment_executions where id = p_execution) then
      raise exception 'execution_token_consumed';
    end if;
    raise exception 'execution_not_found';
  end if;
  return e;
end;
$$;
revoke all on function internal.consume_execution_token(uuid) from public, anon, authenticated;

create or replace function internal.complete_execution(
  p_execution uuid,
  p_status public.execution_status,
  p_rail_ref text default null,
  p_error jsonb default null,
  p_merchant_id text default null,
  p_merchant_order_id text default null
) returns public.payment_executions language plpgsql security definer set search_path = '' as $$
declare
  e public.payment_executions;
  v public.contract_versions;
  order_id uuid;
begin
  if p_status = 'started' then
    raise exception 'execution_status_invalid';
  end if;
  select * into e from public.payment_executions where id = p_execution for update;
  if not found then
    raise exception 'execution_not_found';
  end if;
  if e.status <> 'started' then
    if e.status = p_status then
      return e;  -- idempotent webhook/response replay
    end if;
    raise exception 'execution_already_completed' using detail = e.status::text;
  end if;
  if e.token_consumed_at is null then
    raise exception 'execution_token_not_consumed';
  end if;

  update public.payment_executions
  set status = p_status, rail_ref = p_rail_ref, error = p_error, completed_at = now()
  where id = e.id
  returning * into e;

  select * into v from public.contract_versions where id = e.contract_version_id;
  if p_status = 'authorized' then
    perform internal.transition_contract(v.id, 'executed', 'system', 'payment.authorized', jsonb_build_object(
      'executionId', e.id, 'amountMinor', e.amount_minor, 'rail', e.rail, 'railRef', p_rail_ref
    ));
    if p_merchant_order_id is not null then
      insert into public.orders (execution_id, merchant_id, merchant_order_id, total_minor, currency)
      values (e.id, coalesce(p_merchant_id, v.body #>> '{merchants,0,id}'), p_merchant_order_id, e.amount_minor, e.currency)
      returning id into order_id;
      perform internal.ledger_append(v.plan_id, 'system', 'order.created', jsonb_build_object(
        'orderId', order_id, 'executionId', e.id, 'merchantOrderId', p_merchant_order_id
      ));
    end if;
  else
    perform internal.transition_contract(v.id, 'failed', 'system', 'payment.declined', jsonb_build_object(
      'executionId', e.id, 'status', p_status, 'railRef', p_rail_ref, 'error', p_error
    ));
  end if;
  return e;
end;
$$;
revoke all on function internal.complete_execution(uuid, public.execution_status, text, jsonb, text, text) from public, anon, authenticated;

-- Server entry points. `internal` is not exposed through the Data API, so the secret key reaches
-- these functions only through the wrappers below, which no client role may execute.
create or replace function public.srv_transition_contract(
  p_version uuid, p_to public.contract_status, p_actor text default 'system', p_event text default null, p_payload jsonb default '{}'
) returns public.contract_versions language sql security definer set search_path = '' as $$
  select internal.transition_contract(p_version, p_to, p_actor, p_event, p_payload);
$$;
create or replace function public.srv_begin_execution(
  p_version uuid, p_idem text, p_diff uuid, p_rail public.payment_rail default null, p_instrument uuid default null
) returns uuid language sql security definer set search_path = '' as $$
  select internal.begin_execution(p_version, p_idem, p_diff, p_rail, p_instrument);
$$;
create or replace function public.srv_consume_execution_token(p_execution uuid)
returns public.payment_executions language sql security definer set search_path = '' as $$
  select internal.consume_execution_token(p_execution);
$$;
create or replace function public.srv_complete_execution(
  p_execution uuid, p_status public.execution_status, p_rail_ref text default null, p_error jsonb default null,
  p_merchant_id text default null, p_merchant_order_id text default null
) returns public.payment_executions language sql security definer set search_path = '' as $$
  select internal.complete_execution(p_execution, p_status, p_rail_ref, p_error, p_merchant_id, p_merchant_order_id);
$$;
create or replace function public.srv_ledger_append(p_plan_id uuid, p_actor text, p_type text, p_payload jsonb default '{}')
returns public.ledger_events language sql security definer set search_path = '' as $$
  select internal.ledger_append(p_plan_id, p_actor, p_type, p_payload);
$$;
create or replace function public.srv_verify_ledger(p_plan_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select internal.verify_ledger(p_plan_id);
$$;

revoke all on function public.srv_transition_contract(uuid, public.contract_status, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.srv_begin_execution(uuid, text, uuid, public.payment_rail, uuid) from public, anon, authenticated;
revoke all on function public.srv_consume_execution_token(uuid) from public, anon, authenticated;
revoke all on function public.srv_complete_execution(uuid, public.execution_status, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.srv_ledger_append(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.srv_verify_ledger(uuid) from public, anon, authenticated;
grant execute on function public.srv_transition_contract(uuid, public.contract_status, text, text, jsonb) to service_role;
grant execute on function public.srv_begin_execution(uuid, text, uuid, public.payment_rail, uuid) to service_role;
grant execute on function public.srv_consume_execution_token(uuid) to service_role;
grant execute on function public.srv_complete_execution(uuid, public.execution_status, text, jsonb, text, text) to service_role;
grant execute on function public.srv_ledger_append(uuid, text, text, jsonb) to service_role;
grant execute on function public.srv_verify_ledger(uuid) to service_role;
