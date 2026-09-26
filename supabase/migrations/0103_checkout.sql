-- Phase 13: atomic proof persistence, replay-safe webhooks and grant reservation.
insert into internal.contract_transitions values ('failed', 'invalidated') on conflict do nothing;

create or replace function public.srv_record_checkout_proof(
  p_version uuid, p_session text, p_merchant text, p_state jsonb, p_hash text,
  p_diff jsonb, p_report jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.contract_versions; approved public.proof_reports; snapshot_id uuid; report_id uuid; diff_id uuid;
begin
  select * into v from public.contract_versions where id = p_version for update;
  if not found or v.status not in ('signed', 'armed', 'failed') then raise exception 'contract_not_signed'; end if;
  if p_diff->>'contractHash' <> v.body_hash then raise exception 'contract_hash_mismatch'; end if;
  select * into approved from public.proof_reports where id = v.proof_report_id;
  if not found then raise exception 'proof_missing'; end if;
  insert into public.checkout_snapshots(contract_version_id, merchant_id, acp_session_id, state, state_hash)
  values(v.id, p_merchant, p_session, p_state, p_hash) returning id into snapshot_id;
  insert into public.proof_reports(kind, basket_id, set_id, engine_version, packs, summary, report, hash, evaluated_at)
  values('reproof', approved.basket_id, approved.set_id, p_report->>'engineVersion', p_report->'packs', p_report->'summary', p_report, p_report->>'hash', (p_report->>'evaluatedAt')::timestamptz) returning id into report_id;
  insert into public.consent_diffs(contract_version_id, snapshot_id, reproof_report_id, classification, changes, current_total_minor)
  values(v.id, snapshot_id, report_id, (p_diff->>'classification')::public.diff_classification, p_diff->'changes', (p_diff->>'currentTotalMinor')::bigint) returning id into diff_id;
  perform internal.ledger_append(v.plan_id, 'system', 'checkout.refreshed', jsonb_build_object('snapshotId', snapshot_id, 'diffId', diff_id, 'reproofHash', p_report->>'hash'));
  if p_diff->>'classification' in ('block', 'reapprove') then
    perform internal.transition_contract(v.id, 'invalidated', 'system', 'execution.blocked', jsonb_build_object('diffId', diff_id, 'classification', p_diff->>'classification'));
  elsif p_diff->>'classification' = 'auto' then
    perform internal.ledger_append(v.plan_id, 'system', 'change.auto_accepted', jsonb_build_object('diffId', diff_id));
  end if;
  return diff_id;
end $$;
revoke all on function public.srv_record_checkout_proof(uuid,text,text,jsonb,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.srv_record_checkout_proof(uuid,text,text,jsonb,text,jsonb,jsonb) to service_role;

create or replace function public.srv_receive_greathub_event(p_event jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare v public.contract_versions; e public.payment_executions; o public.orders; w public.webhook_events;
  d jsonb := p_event->'data'; next_status public.order_status; event_time timestamptz;
begin
  -- The caller has already verified HMAC over the exact raw body and a 5-minute timestamp.
  insert into public.webhook_events(provider,event_id,event_type,payload)
  values('greathub',p_event->>'event_id',p_event->>'type',p_event)
  on conflict(provider,event_id) do nothing;
  select * into w from public.webhook_events where provider='greathub' and event_id=p_event->>'event_id' for update;
  if w.processed_at is not null then return 'duplicate'; end if;
  if w.payload <> p_event then raise exception 'webhook_event_collision'; end if;
  select * into v from public.contract_versions where contract_id=(d#>>'{contract,contract_id}')::uuid and version=(d#>>'{contract,version}')::integer for update;
  if not found or v.body_hash <> d#>>'{contract,body_hash}' then raise exception 'webhook_contract_mismatch'; end if;
  select pe.* into e from public.payment_executions pe
    join public.consent_diffs cd on cd.id=pe.diff_id
    join public.checkout_snapshots cs on cs.id=cd.snapshot_id
    where pe.contract_version_id=v.id and cs.acp_session_id=d->>'checkout_session_id'
      and cs.merchant_id='greathub' and pe.token_consumed_at is not null
      and pe.status in ('started','authorized')
    order by pe.created_at desc limit 1 for update of pe;
  if not found then raise exception 'webhook_execution_missing'; end if;
  if e.amount_minor<>(d->>'total_minor')::bigint or e.currency<>d->>'currency' or e.rail::text<>d#>>'{payment,rail}' then raise exception 'webhook_payment_mismatch'; end if;
  if e.status='started' then
    perform internal.complete_execution(e.id,'authorized',d#>>'{payment,transaction_id}',null,'greathub',d->>'order_id');
  end if;
  select * into o from public.orders where execution_id=e.id for update;
  if not found or o.merchant_order_id<>d->>'order_id' then raise exception 'webhook_order_mismatch'; end if;
  next_status := (d->>'status')::public.order_status;
  event_time := (p_event->>'created_at')::timestamptz;
  -- Keep event history, but late delivery cannot regress the displayed order status.
  if not exists(select 1 from jsonb_array_elements(o.events) ev where (ev->>'created_at')::timestamptz > event_time)
    and not (o.status in ('shipped','fulfilled','canceled') and next_status in ('created','manual_review','confirmed'))
    and not (o.status='fulfilled' and next_status='shipped') then
    update public.orders set status=next_status where id=o.id;
  end if;
  update public.orders set events=events||jsonb_build_array(p_event) where id=o.id;
  perform internal.ledger_append(v.plan_id,'merchant:greathub','order.updated',jsonb_build_object('orderId',o.id,'eventId',p_event->>'event_id','status',next_status));
  update public.webhook_events set processed_at=now() where id=w.id;
  return 'processed';
end $$;
revoke all on function public.srv_receive_greathub_event(jsonb) from public,anon,authenticated;
grant execute on function public.srv_receive_greathub_event(jsonb) to service_role;

-- A grant is reserved BEFORE dispatch, across sessions as well as concurrent requests.
create table greathub.payment_grant_uses (
  jti text primary key,
  session_id text not null references greathub.checkout_sessions(id),
  reserved_at timestamptz not null default now()
);
alter table greathub.payment_grant_uses enable row level security;
revoke all on greathub.payment_grant_uses from public,anon,authenticated;
create or replace function greathub.reserve_payment_grant(p_jti text,p_session text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  insert into greathub.payment_grant_uses(jti,session_id) values(p_jti,p_session) on conflict do nothing;
  return found;
end $$;
revoke all on function greathub.reserve_payment_grant(text,text) from public,anon,authenticated;
grant execute on function greathub.reserve_payment_grant(text,text) to service_role;

-- Unknown outcomes never expire into permission for another charge.
create or replace function greathub.claim_session(p_session_id text, p_idempotency_key text)
returns boolean language plpgsql set search_path='' as $$
begin
  update greathub.checkout_sessions set completing_at=now(),complete_idempotency_key=p_idempotency_key
  where id=p_session_id and status in ('not_ready_for_payment','ready_for_payment') and completing_at is null;
  return found;
end $$;
