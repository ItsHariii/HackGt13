-- Private Realtime broadcasts on plan:{id} (SDD §19.3, §19.4). Payloads are deliberately small:
-- clients receive an id plus the fields the live UI renders, then read full rows through RLS.

create policy plan_broadcast_read on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1 from public.plans p
    where p.user_id = (select auth.uid()) and (select realtime.topic()) = 'plan:' || p.id::text
  )
);

create or replace function internal.proof_results_broadcast()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_plan uuid;
begin
  select b.plan_id into v_plan
  from public.proof_reports r join public.baskets b on b.id = r.basket_id
  where r.id = new.report_id;
  perform realtime.send(
    jsonb_build_object(
      'id', new.id, 'reportId', new.report_id, 'requirementId', new.requirement_id,
      'scope', new.scope, 'verdict', new.verdict, 'state', new.state, 'reason', new.reason
    ),
    'proof_result', 'plan:' || v_plan::text, true
  );
  return new;
end;
$$;
revoke all on function internal.proof_results_broadcast() from public, anon, authenticated;
create trigger proof_results_broadcast after insert on public.proof_results
for each row execute function internal.proof_results_broadcast();

create or replace function internal.consent_diffs_broadcast()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_plan uuid;
begin
  select plan_id into v_plan from public.contract_versions where id = new.contract_version_id;
  perform realtime.send(
    jsonb_build_object(
      'id', new.id, 'contractVersionId', new.contract_version_id, 'classification', new.classification,
      'currentTotalMinor', new.current_total_minor, 'changeCount', jsonb_array_length(new.changes)
    ),
    'consent_diff', 'plan:' || v_plan::text, true
  );
  return new;
end;
$$;
revoke all on function internal.consent_diffs_broadcast() from public, anon, authenticated;
create trigger consent_diffs_broadcast after insert on public.consent_diffs
for each row execute function internal.consent_diffs_broadcast();

create or replace function internal.ledger_broadcast()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(
    jsonb_build_object('seq', new.seq, 'type', new.type, 'actor', new.actor, 'hash', new.hash, 'createdAt', new.created_at),
    'ledger_event', 'plan:' || new.plan_id::text, true
  );
  return new;
end;
$$;
revoke all on function internal.ledger_broadcast() from public, anon, authenticated;
create trigger ledger_broadcast after insert on public.ledger_events
for each row execute function internal.ledger_broadcast();

-- Contract status changes drive the checkout screen (PAUSED / PAID) without polling.
create or replace function internal.contract_status_broadcast()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(
    jsonb_build_object('contractVersionId', new.id, 'version', new.version, 'from', old.status, 'to', new.status),
    'contract_status', 'plan:' || new.plan_id::text, true
  );
  return new;
end;
$$;
revoke all on function internal.contract_status_broadcast() from public, anon, authenticated;
create trigger contract_status_broadcast after update of status on public.contract_versions
for each row when (old.status is distinct from new.status)
execute function internal.contract_status_broadcast();
