-- Phase 14: standing mandates (SDD §14). Arming, cancelling and the worker's bookkeeping, plus a
-- per-user Realtime topic so a mandate outcome reaches the user on any page.
--
-- The trigger and deadline always come from the signed contract body (`body.mandate`), never from
-- the caller, so what fires is exactly what was signed. Execution itself reuses the checkout guard
-- path from Phase 13; these functions only move the mandate row and write the ledger.

alter table public.mandates
  add column fired_at timestamptz,
  add column outcome jsonb check (outcome is null or jsonb_typeof(outcome) = 'object');

-- Cancelling a mandate hands the contract back as plain signed consent (SDD §7.5 has no other exit
-- from `armed` that keeps the signature usable).
insert into internal.contract_transitions (from_status, to_status) values ('armed', 'signed')
on conflict do nothing;

create or replace function internal.arm_mandate(p_version uuid, p_actor text)
returns public.mandates language plpgsql security definer set search_path = '' as $$
declare
  v public.contract_versions;
  m public.mandates;
  v_trigger jsonb;
  v_not_after timestamptz;
begin
  select * into v from public.contract_versions where id = p_version for update;
  if not found then
    raise exception 'contract_not_found' using detail = p_version::text;
  end if;

  select * into m from public.mandates where contract_version_id = v.id for update;
  if found then
    if m.status = 'armed' and v.status = 'armed' then
      return m;
    end if;
    raise exception 'mandate_already_used' using detail = m.status::text;
  end if;

  if v.status <> 'signed' then
    raise exception 'contract_not_signed' using detail = v.status::text;
  end if;
  if exists (
    select 1 from public.contract_versions where contract_id = v.contract_id and version > v.version
  ) then
    raise exception 'contract_superseded';
  end if;

  v_trigger := v.body #> '{mandate,trigger}';
  if jsonb_typeof(v.body -> 'mandate') is distinct from 'object' or v_trigger is null
     or v.body #>> '{mandate,notAfter}' is null then
    raise exception 'mandate_missing';
  end if;
  v_not_after := (v.body #>> '{mandate,notAfter}')::timestamptz;
  if v_not_after <= now() or v.expires_at <= now() then
    raise exception 'mandate_expired';
  end if;

  insert into public.mandates (contract_version_id, trigger, not_after, next_check_at)
  values (v.id, v_trigger, least(v_not_after, v.expires_at), now())
  returning * into m;

  perform internal.transition_contract(v.id, 'armed', p_actor, 'mandate.armed', jsonb_build_object(
    'mandateId', m.id, 'trigger', m.trigger, 'notAfter', m.not_after
  ));
  return m;
end;
$$;
revoke all on function internal.arm_mandate(uuid, text) from public, anon, authenticated;

create or replace function internal.cancel_mandate(p_mandate uuid, p_actor text)
returns public.mandates language plpgsql security definer set search_path = '' as $$
declare
  m public.mandates;
  v public.contract_versions;
begin
  select * into m from public.mandates where id = p_mandate for update;
  if not found then
    raise exception 'mandate_not_found' using detail = p_mandate::text;
  end if;
  if m.status = 'cancelled' then
    return m;
  end if;
  select * into v from public.contract_versions where id = m.contract_version_id for update;
  -- Once the worker has started paying, only reconciliation may finish the execution.
  if m.status <> 'armed' or v.status <> 'armed' then
    raise exception 'mandate_not_armed' using detail = m.status::text || '/' || v.status::text;
  end if;

  update public.mandates set status = 'cancelled' where id = m.id returning * into m;
  perform internal.transition_contract(v.id, 'signed', p_actor, 'mandate.cancelled', jsonb_build_object(
    'mandateId', m.id
  ));
  return m;
end;
$$;
revoke all on function internal.cancel_mandate(uuid, text) from public, anon, authenticated;

-- The worker's bookkeeping. p_kind:
--   checked  the trigger did not fire; due again at the next tick.
--   fired    the trigger fired; ledger `mandate.fired` once, before the checkout path runs.
--   settled  the checkout path finished; p_status is the final mandate status.
create or replace function internal.record_mandate(
  p_mandate uuid,
  p_kind text,
  p_observation jsonb default '{}',
  p_status public.mandate_status default null,
  p_outcome jsonb default null
) returns public.mandates language plpgsql security definer set search_path = '' as $$
declare
  m public.mandates;
  v public.contract_versions;
begin
  select * into m from public.mandates where id = p_mandate for update;
  if not found then
    raise exception 'mandate_not_found' using detail = p_mandate::text;
  end if;
  select * into v from public.contract_versions where id = m.contract_version_id for update;

  if p_kind = 'checked' then
    if m.status = 'armed' then
      update public.mandates set last_checked_at = now(), next_check_at = now(),
        outcome = coalesce(p_outcome, outcome)
      where id = m.id returning * into m;
    end if;
  elsif p_kind = 'fired' then
    if m.status <> 'armed' then
      raise exception 'mandate_not_armed' using detail = m.status::text;
    end if;
    if m.fired_at is null then
      update public.mandates set fired_at = now(), last_checked_at = now(), attempts = attempts + 1
      where id = m.id returning * into m;
      perform internal.ledger_append(v.plan_id, 'system:mandate', 'mandate.fired', jsonb_build_object(
        'mandateId', m.id, 'contractVersionId', v.id, 'trigger', m.trigger,
        'observation', coalesce(p_observation, '{}')
      ));
    end if;
  elsif p_kind = 'settled' then
    if p_status is null or p_status in ('armed', 'expired') then
      raise exception 'mandate_status_invalid' using detail = coalesce(p_status::text, 'null');
    end if;
    if m.status <> 'armed' then
      return m;
    end if;
    update public.mandates set status = p_status, last_checked_at = now(), outcome = p_outcome
    where id = m.id returning * into m;
    -- The checkout path already wrote its own ledger events. A mandate that fired but never reached
    -- it (say, no enrolled card) records the stop and leaves plain signed consent behind.
    if v.status = 'armed' then
      perform internal.transition_contract(v.id, 'signed', 'system:mandate',
        case when p_status = 'cancelled' then 'mandate.cancelled' else 'execution.blocked' end,
        jsonb_build_object('mandateId', m.id, 'outcome', coalesce(p_outcome, '{}')));
    end if;
  else
    raise exception 'mandate_record_kind_invalid' using detail = p_kind;
  end if;
  return m;
end;
$$;
revoke all on function internal.record_mandate(uuid, text, jsonb, public.mandate_status, jsonb) from public, anon, authenticated;

create or replace function public.srv_arm_mandate(p_version uuid, p_actor text)
returns public.mandates language sql security definer set search_path = '' as $$
  select internal.arm_mandate(p_version, p_actor);
$$;
create or replace function public.srv_cancel_mandate(p_mandate uuid, p_actor text)
returns public.mandates language sql security definer set search_path = '' as $$
  select internal.cancel_mandate(p_mandate, p_actor);
$$;
create or replace function public.srv_record_mandate(
  p_mandate uuid, p_kind text, p_observation jsonb default '{}',
  p_status public.mandate_status default null, p_outcome jsonb default null
) returns public.mandates language sql security definer set search_path = '' as $$
  select internal.record_mandate(p_mandate, p_kind, p_observation, p_status, p_outcome);
$$;
revoke all on function public.srv_arm_mandate(uuid, text) from public, anon, authenticated;
revoke all on function public.srv_cancel_mandate(uuid, text) from public, anon, authenticated;
revoke all on function public.srv_record_mandate(uuid, text, jsonb, public.mandate_status, jsonb) from public, anon, authenticated;
grant execute on function public.srv_arm_mandate(uuid, text) to service_role;
grant execute on function public.srv_cancel_mandate(uuid, text) to service_role;
grant execute on function public.srv_record_mandate(uuid, text, jsonb, public.mandate_status, jsonb) to service_role;

-- Per-user Realtime topic user:{uid}: mandate outcomes reach the user wherever they are.
create policy user_broadcast_read on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) = 'user:' || (select auth.uid())::text
);

create or replace function internal.mandates_broadcast()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_plan uuid;
  v_user uuid;
begin
  select v.plan_id, p.user_id into v_plan, v_user
  from public.contract_versions v join public.plans p on p.id = v.plan_id
  where v.id = new.contract_version_id;
  perform realtime.send(
    jsonb_build_object(
      'mandateId', new.id, 'contractVersionId', new.contract_version_id, 'planId', v_plan,
      'status', new.status, 'outcome', new.outcome
    ),
    'mandate', 'user:' || v_user::text, true
  );
  return new;
end;
$$;
revoke all on function internal.mandates_broadcast() from public, anon, authenticated;
create trigger mandates_broadcast after insert or update of status on public.mandates
for each row execute function internal.mandates_broadcast();
