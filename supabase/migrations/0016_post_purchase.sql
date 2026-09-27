-- Post-purchase: Evidence Packs and delivery matches (SDD §15, TASKS T15.1, T15.3).
--
-- Every new order is queued on q_evidence_pack; the worker at /api/internal/queue/evidence_pack
-- builds the zip, uploads it to evidence-packs/{user_id}/{order_id}.zip and records it through
-- srv_record_evidence_pack. Delivery scans are recorded through srv_record_delivery. Both write the
-- plan's ledger in the same transaction as their row.

-- Queue a pack for every order, whoever creates it, and wake the worker after commit (pg_net).
create or replace function internal.order_queue_evidence_pack()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pgmq.send('q_evidence_pack', jsonb_build_object('orderId', new.id));
  perform internal.wake_worker('evidence_pack');
  return new;
end;
$$;
revoke all on function internal.order_queue_evidence_pack() from public, anon, authenticated;
create trigger orders_queue_evidence_pack after insert on public.orders
for each row execute function internal.order_queue_evidence_pack();

-- Every minute: re-wake the worker while packs are waiting (a wake-up can fail or be skipped).
create or replace function internal.evidence_packs_tick()
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  waiting bigint;
begin
  select queue_length into waiting from pgmq.metrics('q_evidence_pack');
  if coalesce(waiting, 0) > 0 then
    perform internal.wake_worker('evidence_pack');
  end if;
  return coalesce(waiting, 0);
end;
$$;
revoke all on function internal.evidence_packs_tick() from public, anon, authenticated;
select cron.schedule('evidence-packs-tick', '* * * * *', 'select internal.evidence_packs_tick()');

-- The plan and owner of an order, through its execution and contract version.
create or replace function internal.order_owner(p_order uuid, out plan_id uuid, out user_id uuid)
language sql stable security definer set search_path = '' as $$
  select v.plan_id, p.user_id
  from public.orders o
  join public.payment_executions e on e.id = o.execution_id
  join public.contract_versions v on v.id = e.contract_version_id
  join public.plans p on p.id = v.plan_id
  where o.id = p_order;
$$;
revoke all on function internal.order_owner(uuid) from public, anon, authenticated;

create or replace function public.srv_record_evidence_pack(p_order uuid, p_path text, p_sha256 text)
returns public.evidence_packs language plpgsql security definer set search_path = '' as $$
declare
  owner record;
  pack public.evidence_packs;
begin
  select * into owner from internal.order_owner(p_order);
  if owner.plan_id is null then
    raise exception 'order_not_found' using detail = p_order::text;
  end if;
  if p_path is distinct from owner.user_id::text || '/' || p_order::text || '.zip' then
    raise exception 'evidence_pack_path_invalid' using detail = p_path;
  end if;
  insert into public.evidence_packs (order_id, storage_path, sha256)
  values (p_order, p_path, p_sha256)
  returning * into pack;
  perform internal.ledger_append(owner.plan_id, 'worker:evidence', 'evidence_pack.generated',
    jsonb_build_object('orderId', p_order, 'packId', pack.id, 'sha256', p_sha256));
  return pack;
end;
$$;

-- A delivery scan by the order's owner. The payload carries product identifiers only.
create or replace function public.srv_record_delivery(p_order uuid, p_user uuid, p_type text, p_payload jsonb)
returns public.ledger_events language plpgsql security definer set search_path = '' as $$
declare
  owner record;
begin
  if p_type not in ('delivery.matched', 'delivery.mismatched') then
    raise exception 'delivery_type_invalid' using detail = p_type;
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or p_payload ->> 'gtin' !~ '^[0-9]{14}$' then
    raise exception 'delivery_payload_invalid';
  end if;
  select * into owner from internal.order_owner(p_order);
  if owner.plan_id is null or owner.user_id is distinct from p_user then
    raise exception 'order_not_found' using detail = p_order::text;
  end if;
  return internal.ledger_append(owner.plan_id, 'user:' || p_user::text, p_type,
    p_payload || jsonb_build_object('orderId', p_order));
end;
$$;

revoke all on function public.srv_record_evidence_pack(uuid, text, text) from public, anon, authenticated;
revoke all on function public.srv_record_delivery(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.srv_record_evidence_pack(uuid, text, text) to service_role;
grant execute on function public.srv_record_delivery(uuid, uuid, text, jsonb) to service_role;
