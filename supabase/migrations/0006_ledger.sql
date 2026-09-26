-- Append-only, hash-chained audit ledger (SDD §12.3).
--
-- hash = sha256 over the UTF-8 bytes of
--   prev_hash | seq | plan_id | actor | type | created_at (UTC, microseconds, ISO 8601) | payload::text
-- joined with '|'. The first event of a plan chains from 64 zeros. jsonb's text form is canonical in
-- Postgres, and Evidence Packs export payload_text verbatim so verify.mjs can recompute offline.
--
-- plan_id has no foreign key on purpose: deleting a plan leaves its events (unreadable, since RLS
-- joins through plans) rather than breaking the chain. Payloads must never carry personal data.

create table public.ledger_events (
  id bigint generated always as identity primary key,
  plan_id uuid not null,
  seq bigint not null check (seq >= 1),
  actor text not null check (actor ~ '^(user|system|worker|merchant):?'),
  type text not null check (type in (
    'plan.created', 'requirements.extracted', 'requirement.confirmed', 'requirement.edited',
    'basket.solved', 'proof.completed', 'contract.drafted', 'contract.signed', 'contract.expired',
    'mandate.armed', 'mandate.fired', 'mandate.expired', 'mandate.cancelled',
    'checkout.refreshed', 'checkout.handed_off', 'diff.detected', 'change.auto_accepted',
    'execution.blocked', 'contract.superseded', 'execution.started', 'payment.authorized',
    'payment.declined', 'order.created', 'order.updated', 'evidence_pack.generated',
    'delivery.matched', 'delivery.mismatched'
  )),
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  prev_hash text not null check (prev_hash ~ '^[0-9a-f]{64}$'),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (plan_id, seq)
);

create or replace function internal.ledger_hash(
  p_prev_hash text, p_seq bigint, p_plan_id uuid, p_actor text, p_type text, p_created_at timestamptz, p_payload jsonb
) returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(convert_to(concat_ws('|',
    p_prev_hash,
    p_seq::text,
    p_plan_id::text,
    p_actor,
    p_type,
    to_char(p_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    p_payload::text
  ), 'UTF8'), 'sha256'), 'hex');
$$;
revoke all on function internal.ledger_hash(text, bigint, uuid, text, text, timestamptz, jsonb) from public, anon, authenticated;

-- Chains every insert, whoever the writer is. The advisory lock serializes appends per plan.
create or replace function internal.ledger_chain()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  prev record;
begin
  perform pg_advisory_xact_lock(hashtext('ledger:' || new.plan_id::text));
  select e.seq, e.hash into prev
  from public.ledger_events e
  where e.plan_id = new.plan_id
  order by e.seq desc
  limit 1;

  new.seq := coalesce(prev.seq, 0) + 1;
  new.prev_hash := coalesce(prev.hash, repeat('0', 64));
  new.created_at := now();
  new.hash := internal.ledger_hash(new.prev_hash, new.seq, new.plan_id, new.actor, new.type, new.created_at, new.payload);
  return new;
end;
$$;
revoke all on function internal.ledger_chain() from public, anon, authenticated;
create trigger ledger_chain before insert on public.ledger_events
for each row execute function internal.ledger_chain();

create or replace function internal.ledger_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'ledger_events is append-only' using errcode = 'insufficient_privilege';
end;
$$;
revoke all on function internal.ledger_immutable() from public, anon, authenticated;
create trigger ledger_immutable before update or delete on public.ledger_events
for each row execute function internal.ledger_immutable();
create trigger ledger_no_truncate before truncate on public.ledger_events
for each statement execute function internal.ledger_immutable();

revoke all on public.ledger_events from public, anon, authenticated, service_role;

create or replace function internal.ledger_append(p_plan_id uuid, p_actor text, p_type text, p_payload jsonb default '{}')
returns public.ledger_events language plpgsql security definer set search_path = '' as $$
declare
  ev public.ledger_events;
begin
  if not exists (select 1 from public.plans where id = p_plan_id) then
    raise exception 'plan_not_found: %', p_plan_id using errcode = 'foreign_key_violation';
  end if;
  insert into public.ledger_events (plan_id, seq, actor, type, payload, prev_hash, hash)
  values (p_plan_id, 1, p_actor, p_type, coalesce(p_payload, '{}'), repeat('0', 64), repeat('0', 64))
  returning * into ev;
  return ev;
end;
$$;
revoke all on function internal.ledger_append(uuid, text, text, jsonb) from public, anon, authenticated;

-- Returns the first seq whose link or hash does not check out, or null when the chain is intact.
create or replace function internal.verify_ledger(p_plan_id uuid)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare
  e record;
  expected_prev text := repeat('0', 64);
  expected_seq bigint := 1;
begin
  for e in
    select l.seq, l.actor, l.type, l.payload, l.prev_hash, l.hash, l.created_at
    from public.ledger_events l
    where l.plan_id = p_plan_id
    order by l.seq
  loop
    if e.seq <> expected_seq
       or e.prev_hash <> expected_prev
       or e.hash <> internal.ledger_hash(e.prev_hash, e.seq, p_plan_id, e.actor, e.type, e.created_at, e.payload) then
      return e.seq;
    end if;
    expected_prev := e.hash;
    expected_seq := e.seq + 1;
  end loop;
  return null;
end;
$$;
revoke all on function internal.verify_ledger(uuid) from public, anon, authenticated;
