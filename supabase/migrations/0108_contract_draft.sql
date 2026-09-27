-- Drafting a contract version from a solved plan (TASKS T11.6; SDD §7.5, §12.1).
-- The server builds the body from a fresh GreatHub checkout and its proof; this records the
-- contract (on first draft), the approval report and the draft version in one transaction,
-- and refuses a body whose version or parent hash no longer matches the stored chain.

create or replace function public.srv_draft_contract_version(
  p_plan uuid, p_basket uuid, p_set uuid, p_report jsonb, p_body jsonb, p_hash text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_contract uuid := (p_body->>'contractId')::uuid;
  v_version integer := (p_body->>'version')::integer;
  v_parent public.contract_versions;
  v_report uuid;
  v_id uuid;
begin
  if p_body->>'planId' is distinct from p_plan::text then raise exception 'contract_plan_mismatch'; end if;
  if not exists (select 1 from public.baskets where id = p_basket and plan_id = p_plan) then
    raise exception 'basket_not_in_plan';
  end if;
  if not exists (select 1 from public.requirement_sets where id = p_set and plan_id = p_plan) then
    raise exception 'set_not_in_plan';
  end if;
  insert into public.contracts(id, plan_id) values (v_contract, p_plan) on conflict (id) do nothing;
  if not exists (select 1 from public.contracts where id = v_contract and plan_id = p_plan) then
    raise exception 'contract_plan_mismatch';
  end if;

  -- The body names its version and parent; both must extend the stored chain exactly.
  select * into v_parent from public.contract_versions
    where contract_id = v_contract order by version desc limit 1 for update;
  if v_version is distinct from coalesce(v_parent.version, 0) + 1
     or (p_body->>'parentHash') is distinct from v_parent.body_hash then
    raise exception 'contract_changed';
  end if;

  insert into public.proof_reports(kind, basket_id, set_id, engine_version, packs, summary, report, hash,
    evaluated_at, checkout_state)
  values ('plan', p_basket, p_set, p_report->>'engineVersion', p_report->'packs', p_report->'summary',
    p_report->'report', p_report->>'hash', (p_report->>'evaluatedAt')::timestamptz,
    nullif(p_report->'checkoutState', 'null'::jsonb))
  returning id into v_report;

  insert into public.contract_versions(contract_id, plan_id, version, parent_version_id, basket_id,
    proof_report_id, body, body_hash, status, autonomy, expires_at)
  values (v_contract, p_plan, v_version, v_parent.id, p_basket, v_report, p_body, p_hash, 'draft',
    p_body->'autonomy', (p_body->>'expiresAt')::timestamptz)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.srv_draft_contract_version(uuid, uuid, uuid, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.srv_draft_contract_version(uuid, uuid, uuid, jsonb, jsonb, text) to service_role;
