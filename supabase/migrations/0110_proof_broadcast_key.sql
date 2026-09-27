-- proof_result broadcasts name the rule by its requirement key (the engine's requirementId), not the
-- requirements row UUID. The Proof panel's rows carry that key (data-requirement-id), so the Inspector
-- can walk to the row a streamed result belongs to (SDD §17.9, Motion board 03).

create or replace function internal.proof_results_broadcast()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_plan uuid;
  v_key text;
begin
  select b.plan_id into v_plan
  from public.proof_reports r join public.baskets b on b.id = r.basket_id
  where r.id = new.report_id;
  select q.requirement_key into v_key from public.requirements q where q.id = new.requirement_id;
  perform realtime.send(
    jsonb_build_object(
      'id', new.id, 'reportId', new.report_id, 'requirementId', v_key,
      'scope', new.scope, 'verdict', new.verdict, 'state', new.state, 'reason', new.reason
    ),
    'proof_result', 'plan:' || v_plan::text, true
  );
  return new;
end;
$$;
revoke all on function internal.proof_results_broadcast() from public, anon, authenticated;
