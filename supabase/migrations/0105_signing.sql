-- Phase 12 passkey signing (SDD §12.2): registration challenges, signing challenges, and the one
-- transaction that stores a verified assertion and moves the version to signed.
-- Every function is server-only. The API route verifies the WebAuthn assertion; these functions
-- re-check ownership, state, freshness, hash and counter under row locks.

-- Registration challenges are never read by clients or typed into the public schema.
create table internal.signing_registration_challenges (
  challenge text primary key check (challenge ~ '^[A-Za-z0-9_-]{16,128}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '2 minutes'),
  created_at timestamptz not null default now()
);
create index signing_registration_challenges_user_idx on internal.signing_registration_challenges (user_id);
create index signing_registration_challenges_expires_idx on internal.signing_registration_challenges (expires_at);
revoke all on internal.signing_registration_challenges from public, anon, authenticated;

-- One outstanding registration per user; expired rows are swept on every call.
create or replace function public.srv_begin_signing_registration(p_user uuid, p_challenge text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare expires timestamptz;
begin
  delete from internal.signing_registration_challenges where user_id = p_user or expires_at <= now();
  insert into internal.signing_registration_challenges (challenge, user_id) values (p_challenge, p_user)
  returning expires_at into expires;
  return expires;
end $$;
revoke all on function public.srv_begin_signing_registration(uuid, text) from public, anon, authenticated;
grant execute on function public.srv_begin_signing_registration(uuid, text) to service_role;

-- Single use: deleted whether or not it is still fresh, and whether or not verification later passes.
create or replace function public.srv_consume_signing_registration(p_user uuid, p_challenge text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare fresh boolean;
begin
  delete from internal.signing_registration_challenges
  where challenge = p_challenge and user_id = p_user
  returning expires_at > now() into fresh;
  return coalesce(fresh, false);
end $$;
revoke all on function public.srv_consume_signing_registration(uuid, text) from public, anon, authenticated;
grant execute on function public.srv_consume_signing_registration(uuid, text) to service_role;

-- Loads the version under lock and applies every precondition for signing it.
create or replace function internal.signable_version(p_user uuid, p_version uuid, p_hash text)
returns public.contract_versions language plpgsql security definer set search_path = '' as $$
declare v public.contract_versions;
begin
  select cv.* into v from public.contract_versions cv
  join public.plans p on p.id = cv.plan_id
  where cv.id = p_version and p.user_id = p_user
  for update of cv;
  if not found then raise exception 'contract_not_found'; end if;
  if v.status <> 'awaiting_signature' then raise exception 'contract_not_awaiting_signature'; end if;
  if v.expires_at <= now() then raise exception 'contract_expired'; end if;
  if exists (select 1 from public.contract_versions where contract_id = v.contract_id and version > v.version) then
    raise exception 'contract_superseded';
  end if;
  if v.body_hash <> p_hash then raise exception 'body_hash_mismatch'; end if;
  return v;
end $$;
revoke all on function internal.signable_version(uuid, uuid, text) from public, anon, authenticated;

-- Issues the 2-minute challenge `ct1:{H}:{N}`. The caller computed H from the stored body.
create or replace function public.srv_begin_signing(
  p_user uuid, p_version uuid, p_hash text, p_nonce text, p_challenge text
) returns timestamptz language plpgsql security definer set search_path = '' as $$
declare expires timestamptz;
begin
  perform internal.signable_version(p_user, p_version, p_hash);
  if p_challenge <> 'ct1:' || substr(p_hash, 8) || ':' || p_nonce then raise exception 'challenge_invalid'; end if;
  if not exists (select 1 from public.signing_credentials where user_id = p_user) then
    raise exception 'signing_key_required';
  end if;
  delete from public.signing_challenges
  where expires_at <= now() or (user_id = p_user and contract_version_id = p_version);
  insert into public.signing_challenges (nonce, user_id, contract_version_id, body_hash, challenge)
  values (p_nonce, p_user, p_version, p_hash, p_challenge)
  returning expires_at into expires;
  return expires;
end $$;
revoke all on function public.srv_begin_signing(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.srv_begin_signing(uuid, uuid, text, text, text) to service_role;

-- Deletes the challenge before any verification runs, so a failed attempt cannot be replayed.
create or replace function public.srv_consume_signing_challenge(p_user uuid, p_nonce text)
returns table (contract_version_id uuid, body_hash text, challenge text, expired boolean)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  delete from public.signing_challenges c
  where c.nonce = p_nonce and c.user_id = p_user
  returning c.contract_version_id, c.body_hash, c.challenge, c.expires_at <= now();
end $$;
revoke all on function public.srv_consume_signing_challenge(uuid, text) from public, anon, authenticated;
grant execute on function public.srv_consume_signing_challenge(uuid, text) to service_role;

-- One transaction: store the full assertion and public key, advance the counter, transition to
-- signed and append contract.signed to the ledger (transition_contract does both).
create or replace function public.srv_record_contract_signature(
  p_user uuid, p_version uuid, p_hash text, p_challenge text, p_credential text,
  p_authenticator_data bytea, p_client_data_json bytea, p_signature bytea, p_counter bigint
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.contract_versions;
  c public.signing_credentials;
  sig_id uuid;
begin
  v := internal.signable_version(p_user, p_version, p_hash);
  if p_challenge not like 'ct1:' || substr(p_hash, 8) || ':%' then raise exception 'challenge_invalid'; end if;
  select * into c from public.signing_credentials
  where credential_id = p_credential and user_id = p_user for update;
  if not found then raise exception 'credential_not_found'; end if;
  -- Authenticators that never count report 0; any that do must strictly increase (clone detection).
  if p_counter < 0 or ((p_counter > 0 or c.counter > 0) and p_counter <= c.counter) then
    raise exception 'counter_regressed';
  end if;
  insert into public.contract_signatures (
    contract_version_id, credential_id, credential_public_key, body_hash, challenge,
    authenticator_data, client_data_json, signature, verified_at
  ) values (
    v.id, c.id, c.public_key, v.body_hash, p_challenge,
    p_authenticator_data, p_client_data_json, p_signature, now()
  ) returning id into sig_id;
  update public.signing_credentials set counter = p_counter, last_used_at = now() where id = c.id;
  perform internal.transition_contract(
    v.id, 'signed', 'user:' || p_user::text, 'contract.signed',
    jsonb_build_object('signatureId', sig_id, 'credentialId', p_credential)
  );
  return sig_id;
end $$;
revoke all on function public.srv_record_contract_signature(uuid, uuid, text, text, text, bytea, bytea, bytea, bigint)
  from public, anon, authenticated;
grant execute on function public.srv_record_contract_signature(uuid, uuid, text, text, text, bytea, bytea, bytea, bigint)
  to service_role;
