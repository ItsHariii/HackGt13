-- Solving a saved plan into baskets (TASKS T11.3, T11.5; SDD §9, §19.2).
-- The server solves, quotes each basket through GreatHub's checkout and proves it, then
-- records the whole run in one transaction so a plan never shows half a solve.

-- The solver input (and display context) the compare screen re-solves from with relaxed limits.
alter table public.solver_runs
  add column problem jsonb check (problem is null or jsonb_typeof(problem) = 'object'),
  add column context jsonb check (context is null or jsonb_typeof(context) = 'object');

-- The checkout state a plan report was proved against, so the workspace can render the
-- report's evidence without re-reading the merchant.
alter table public.proof_reports
  add column checkout_state jsonb check (checkout_state is null or jsonb_typeof(checkout_state) = 'object');

-- p_run: { inputHash, status, objective, conflictSet, ms, problem, context,
--   baskets: [{ label, items: [{ role, offerId, qty }],
--     report: { report, hash, engineVersion, packs, summary, evaluatedAt, checkoutState,
--       results: [{ requirementKey, scope, verdict, state, reason, observed, target }] } }] }
create or replace function public.srv_record_plan_solve(p_plan uuid, p_set uuid, p_run jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_run uuid; v_basket uuid; v_report uuid; b jsonb; r jsonb; v_baskets jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from public.requirement_sets where id = p_set and plan_id = p_plan) then
    raise exception 'set_not_in_plan';
  end if;
  insert into public.solver_runs(plan_id, set_id, input_hash, status, objective, conflict_set, ms, problem, context)
  values (p_plan, p_set, p_run->>'inputHash', (p_run->>'status')::public.solver_status,
    nullif(p_run->>'objective', '')::numeric, nullif(p_run->'conflictSet', 'null'::jsonb),
    (p_run->>'ms')::integer, nullif(p_run->'problem', 'null'::jsonb), nullif(p_run->'context', 'null'::jsonb))
  returning id into v_run;

  for b in select * from jsonb_array_elements(coalesce(p_run->'baskets', '[]'::jsonb)) loop
    insert into public.baskets(plan_id, solver_run_id, label) values (p_plan, v_run, b->>'label')
    returning id into v_basket;
    insert into public.basket_items(basket_id, role, offer_id, qty)
      select v_basket, i->>'role', (i->>'offerId')::uuid, coalesce((i->>'qty')::integer, 1)
      from jsonb_array_elements(b->'items') i;
    r := b->'report';
    if r is not null and r <> 'null'::jsonb then
      insert into public.proof_reports(kind, basket_id, set_id, engine_version, packs, summary, report, hash,
        evaluated_at, checkout_state)
      values ('plan', v_basket, p_set, r->>'engineVersion', r->'packs', r->'summary', r->'report', r->>'hash',
        (r->>'evaluatedAt')::timestamptz, nullif(r->'checkoutState', 'null'::jsonb))
      returning id into v_report;
      -- One row per result, which is what the Realtime trigger streams to the Proof panel.
      insert into public.proof_results(report_id, requirement_id, scope, verdict, state, reason, observed, target)
        select v_report, q.id, x->'scope', (x->>'verdict')::public.verdict, (x->>'state')::public.evidence_state,
          x->>'reason', nullif(x->'observed', 'null'::jsonb), nullif(x->'target', 'null'::jsonb)
        from jsonb_array_elements(coalesce(r->'results', '[]'::jsonb)) x
        join public.requirements q on q.set_id = p_set and q.requirement_key = x->>'requirementKey';
    end if;
    v_baskets := v_baskets || jsonb_build_object('label', b->>'label', 'basketId', v_basket, 'reportId', v_report);
    v_report := null;
  end loop;
  return jsonb_build_object('runId', v_run, 'baskets', v_baskets);
end;
$$;
revoke all on function public.srv_record_plan_solve(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.srv_record_plan_solve(uuid, uuid, jsonb) to service_role;
