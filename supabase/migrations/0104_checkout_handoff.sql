-- Save the approved checkout BEFORE signing. Call from the contract draft path.
-- Snapshot + report hashes remain bound to the immutable signed contract.
create or replace function public.srv_bind_approved_checkout(
  p_version uuid, p_session text, p_merchant text, p_state jsonb, p_hash text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v public.contract_versions; snapshot_id uuid;
begin
  select * into v from public.contract_versions where id=p_version for update;
  if not found or v.status not in ('draft','awaiting_signature') then raise exception 'approval_already_signed'; end if;
  if p_state->>'approval' <> 'true' or jsonb_typeof(p_state->'checkout')<>'object' then raise exception 'approval_snapshot_invalid'; end if;
  delete from public.checkout_snapshots where contract_version_id=v.id and state->>'approval'='true';
  insert into public.checkout_snapshots(contract_version_id,merchant_id,acp_session_id,state,state_hash)
  values(v.id,p_merchant,p_session,p_state,p_hash) returning id into snapshot_id;
  return snapshot_id;
end $$;
revoke all on function public.srv_bind_approved_checkout(uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.srv_bind_approved_checkout(uuid,text,text,jsonb,text) to service_role;

create or replace function public.srv_record_handoff(p_version uuid,p_diff uuid,p_url text)
returns void language plpgsql security definer set search_path='' as $$
declare v public.contract_versions; d public.consent_diffs;
begin
  select * into v from public.contract_versions where id=p_version for update;
  if not found or v.status not in ('signed','armed') or v.expires_at<=now() then raise exception 'contract_not_signed'; end if;
  if exists(select 1 from public.contract_versions where contract_id=v.contract_id and version>v.version) then raise exception 'contract_superseded'; end if;
  if not exists(select 1 from public.contract_signatures where contract_version_id=v.id and body_hash=v.body_hash and verified_at is not null) then raise exception 'signature_missing'; end if;
  select * into d from public.consent_diffs where id=p_diff and contract_version_id=v.id;
  if not found or d.classification not in ('identical','auto') or d.created_at<now()-interval '90 seconds' or d.current_total_minor>(v.body#>>'{economics,maxTotalMinor}')::bigint then raise exception 'handoff_not_approved'; end if;
  if exists(select 1 from public.ledger_events where plan_id=v.plan_id and type='checkout.handed_off' and payload->>'diffId'=d.id::text) then return; end if;
  perform internal.ledger_append(v.plan_id,'system','checkout.handed_off',jsonb_build_object('contractVersionId',v.id,'diffId',d.id,'url',p_url,'checkedAt',d.created_at));
end $$;
revoke all on function public.srv_record_handoff(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.srv_record_handoff(uuid,uuid,text) to service_role;

-- A webhook may arrive after the synchronous response created the order. Keep
-- the processor transaction reference even in that ordering of events.
create or replace function internal.webhook_payment_reference()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.provider='greathub' and new.processed_at is not null and old.processed_at is null then
    update public.payment_executions e set rail_ref=coalesce(e.rail_ref,new.payload#>>'{data,payment,transaction_id}')
    from public.orders o where o.execution_id=e.id and o.merchant_id='greathub' and o.merchant_order_id=new.payload#>>'{data,order_id}';
  end if;
  return new;
end $$;
revoke all on function internal.webhook_payment_reference() from public,anon,authenticated;
create trigger webhook_payment_reference after update on public.webhook_events for each row execute function internal.webhook_payment_reference();
