-- Contracts, versions, passkey signing and the contract state machine (SDD §7.5, §12.1, §12.2).

create type public.contract_status as enum (
  'draft', 'awaiting_signature', 'signed', 'armed', 'executing',
  'executed', 'failed', 'invalidated', 'superseded', 'expired'
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (id, plan_id)
);
create index contracts_plan_idx on public.contracts (plan_id);

create table public.contract_versions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null,
  -- Denormalized so the guard and ledger never need a join; the composite FK keeps it consistent.
  plan_id uuid not null,
  version integer not null check (version >= 1),
  parent_version_id uuid references public.contract_versions (id) on delete set null,
  basket_id uuid references public.baskets (id) on delete set null,
  proof_report_id uuid references public.proof_reports (id) on delete set null,
  body jsonb not null check (jsonb_typeof(body) = 'object'),
  -- SHA-256 over the RFC 8785 (JCS) canonical body, computed by packages/contracts.
  body_hash text not null check (body_hash ~ '^sha256:[0-9a-f]{64}$'),
  status public.contract_status not null default 'draft',
  autonomy jsonb not null check (jsonb_typeof(autonomy) = 'object'),
  expires_at timestamptz not null,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, version),
  foreign key (contract_id, plan_id) references public.contracts (id, plan_id) on delete cascade,
  check (parent_version_id is distinct from id),
  check (body #>> '{economics,maxTotalMinor}' ~ '^[0-9]+$')
);
create index contract_versions_plan_idx on public.contract_versions (plan_id);
create index contract_versions_status_idx on public.contract_versions (status, expires_at);
create index contract_versions_parent_idx on public.contract_versions (parent_version_id);

-- Allowed transitions, straight from the state diagram in SDD §7.5 (plus draft -> superseded,
-- so a draft edited before it reaches awaiting_signature is not stranded).
create table internal.contract_transitions (
  from_status public.contract_status not null,
  to_status public.contract_status not null,
  primary key (from_status, to_status)
);
insert into internal.contract_transitions (from_status, to_status) values
  ('draft', 'awaiting_signature'),
  ('draft', 'superseded'),
  ('awaiting_signature', 'signed'),
  ('awaiting_signature', 'superseded'),
  ('signed', 'armed'),
  ('signed', 'executing'),
  ('signed', 'invalidated'),
  ('signed', 'expired'),
  ('armed', 'executing'),
  ('armed', 'invalidated'),
  ('armed', 'expired'),
  ('invalidated', 'superseded'),
  ('executing', 'executed'),
  ('executing', 'failed'),
  ('failed', 'executing');
revoke all on internal.contract_transitions from public, anon, authenticated;

create table public.signing_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  credential_id text not null unique check (credential_id ~ '^[A-Za-z0-9_-]+$'),
  public_key bytea not null,
  counter bigint not null default 0 check (counter >= 0),
  transports text[] not null default '{}',
  device_label text check (char_length(device_label) <= 80),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index signing_credentials_user_idx on public.signing_credentials (user_id);

-- Single-use, 2-minute challenges. Deleted on verify, pass or fail (replay defense).
create table public.signing_challenges (
  nonce text primary key check (char_length(nonce) between 16 and 128),
  user_id uuid not null references auth.users (id) on delete cascade,
  contract_version_id uuid not null references public.contract_versions (id) on delete cascade,
  body_hash text not null check (body_hash ~ '^sha256:[0-9a-f]{64}$'),
  challenge text not null,
  expires_at timestamptz not null default (now() + interval '2 minutes'),
  created_at timestamptz not null default now()
);
create index signing_challenges_version_idx on public.signing_challenges (contract_version_id);
create index signing_challenges_expires_idx on public.signing_challenges (expires_at);

-- The full assertion plus the public key, so an Evidence Pack re-verifies offline.
create table public.contract_signatures (
  id uuid primary key default gen_random_uuid(),
  contract_version_id uuid not null references public.contract_versions (id) on delete cascade,
  credential_id uuid references public.signing_credentials (id) on delete set null,
  credential_public_key bytea not null,
  body_hash text not null check (body_hash ~ '^sha256:[0-9a-f]{64}$'),
  challenge text not null,
  authenticator_data bytea not null,
  client_data_json bytea not null,
  signature bytea not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index contract_signatures_version_idx on public.contract_signatures (contract_version_id);
create index contract_signatures_credential_idx on public.contract_signatures (credential_id);

-- Enforces the state machine for every writer, including the secret key.
create or replace function internal.contract_status_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'awaiting_signature') then
      raise exception 'illegal_contract_transition: new versions start as draft or awaiting_signature, not %', new.status
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- What was signed can never change underneath the signature.
  if old.status <> 'draft' and (
    new.body is distinct from old.body or new.body_hash is distinct from old.body_hash
    or new.autonomy is distinct from old.autonomy or new.expires_at is distinct from old.expires_at
    or new.contract_id is distinct from old.contract_id or new.plan_id is distinct from old.plan_id
    or new.version is distinct from old.version
  ) then
    raise exception 'contract_version_immutable: % is %', old.id, old.status using errcode = 'check_violation';
  end if;

  if new.status is distinct from old.status then
    if not exists (
      select 1 from internal.contract_transitions t
      where t.from_status = old.status and t.to_status = new.status
    ) then
      raise exception 'illegal_contract_transition: % -> %', old.status, new.status using errcode = 'check_violation';
    end if;
    if new.status = 'signed' then
      if not exists (
        select 1 from public.contract_signatures s
        where s.contract_version_id = new.id and s.body_hash = new.body_hash and s.verified_at is not null
      ) then
        raise exception 'signature_missing' using errcode = 'check_violation';
      end if;
      new.signed_at := now();
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function internal.contract_status_guard() from public, anon, authenticated;
create trigger contract_status_guard before insert or update on public.contract_versions
for each row execute function internal.contract_status_guard();
