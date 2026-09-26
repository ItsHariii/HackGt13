-- Row-level security for every public table from 0001–0007 (SDD §19.3).
-- Tables added by later migrations enable RLS in their own migration; supabase/tests/rls.test.sql
-- fails if any public table is left without it.
--
-- Model: deny by default. Table privileges are revoked from anon/authenticated and granted back per
-- table; policies then scope rows to the plan owner. The server's secret key (service_role) bypasses
-- RLS but still needs table privileges, and it never gets UPDATE/DELETE on the ledger.

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'plans', 'requirement_sets', 'requirements',
    'sources', 'products', 'offers', 'facts',
    'solver_runs', 'baskets', 'basket_items', 'proof_reports', 'proof_results',
    'contracts', 'contract_versions', 'signing_credentials', 'signing_challenges', 'contract_signatures',
    'checkout_snapshots', 'consent_diffs', 'payment_instruments', 'payment_executions', 'orders',
    'webhook_events', 'mandates', 'evidence_packs', 'ledger_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    if t <> 'ledger_events' then
      execute format('grant all on public.%I to service_role', t);
    end if;
  end loop;
end;
$$;
grant select on public.ledger_events to service_role;

-- Profiles ----------------------------------------------------------------------------------------
grant select, insert on public.profiles to authenticated;
grant update (display_name, default_autonomy) on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated
using (user_id = (select auth.uid()));
create policy profiles_insert on public.profiles for insert to authenticated
with check (user_id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Plans and requirements --------------------------------------------------------------------------
grant select, insert, delete on public.plans to authenticated;
grant update (title, brief, packs) on public.plans to authenticated;
create policy plans_select on public.plans for select to authenticated
using (user_id = (select auth.uid()));
create policy plans_insert on public.plans for insert to authenticated
with check (user_id = (select auth.uid()));
create policy plans_update on public.plans for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy plans_delete on public.plans for delete to authenticated
using (user_id = (select auth.uid()));

-- Requirement sets are immutable versions: insert and read only.
grant select, insert on public.requirement_sets, public.requirements to authenticated;
create policy requirement_sets_select on public.requirement_sets for select to authenticated
using (exists (select 1 from public.plans p where p.id = plan_id and p.user_id = (select auth.uid())));
create policy requirement_sets_insert on public.requirement_sets for insert to authenticated
with check (exists (select 1 from public.plans p where p.id = plan_id and p.user_id = (select auth.uid())));
create policy requirements_select on public.requirements for select to authenticated
using (exists (
  select 1 from public.requirement_sets s join public.plans p on p.id = s.plan_id
  where s.id = set_id and p.user_id = (select auth.uid())
));
create policy requirements_insert on public.requirements for insert to authenticated
with check (exists (
  select 1 from public.requirement_sets s join public.plans p on p.id = s.plan_id
  where s.id = set_id and p.user_id = (select auth.uid())
));

-- Catalog: readable before sign-in; written only by the server --------------------------------------
grant select on public.sources, public.products, public.offers, public.facts to anon, authenticated;
create policy sources_read on public.sources for select to anon, authenticated using (true);
create policy products_read on public.products for select to anon, authenticated using (true);
create policy offers_read on public.offers for select to anon, authenticated using (true);
create policy facts_read on public.facts for select to anon, authenticated using (true);

-- Engine output: read-only for the owner ------------------------------------------------------------
grant select on public.solver_runs, public.baskets, public.basket_items, public.proof_reports, public.proof_results
to authenticated;
create policy solver_runs_select on public.solver_runs for select to authenticated
using (exists (select 1 from public.plans p where p.id = plan_id and p.user_id = (select auth.uid())));
create policy baskets_select on public.baskets for select to authenticated
using (exists (select 1 from public.plans p where p.id = plan_id and p.user_id = (select auth.uid())));
create policy basket_items_select on public.basket_items for select to authenticated
using (exists (
  select 1 from public.baskets b join public.plans p on p.id = b.plan_id
  where b.id = basket_id and p.user_id = (select auth.uid())
));
create policy proof_reports_select on public.proof_reports for select to authenticated
using (exists (
  select 1 from public.baskets b join public.plans p on p.id = b.plan_id
  where b.id = basket_id and p.user_id = (select auth.uid())
));
create policy proof_results_select on public.proof_results for select to authenticated
using (exists (
  select 1 from public.proof_reports r
  join public.baskets b on b.id = r.basket_id
  join public.plans p on p.id = b.plan_id
  where r.id = report_id and p.user_id = (select auth.uid())
));

-- Consent: read-only for the owner. Status moves only through internal.transition_contract. -------
grant select on public.contracts, public.contract_versions, public.contract_signatures to authenticated;
create policy contracts_select on public.contracts for select to authenticated
using (exists (select 1 from public.plans p where p.id = plan_id and p.user_id = (select auth.uid())));
create policy contract_versions_select on public.contract_versions for select to authenticated
using (exists (select 1 from public.plans p where p.id = plan_id and p.user_id = (select auth.uid())));
create policy contract_signatures_select on public.contract_signatures for select to authenticated
using (exists (
  select 1 from public.contract_versions v join public.plans p on p.id = v.plan_id
  where v.id = contract_version_id and p.user_id = (select auth.uid())
));

-- A user may list and remove their own signing keys; registration is verified server-side.
grant select, delete on public.signing_credentials to authenticated;
create policy signing_credentials_select on public.signing_credentials for select to authenticated
using (user_id = (select auth.uid()));
create policy signing_credentials_delete on public.signing_credentials for delete to authenticated
using (user_id = (select auth.uid()));
-- signing_challenges: server only (no grants, no policies).

-- Execution: read-only for the owner --------------------------------------------------------------
grant select on public.checkout_snapshots, public.consent_diffs, public.payment_executions, public.mandates
to authenticated;
create policy checkout_snapshots_select on public.checkout_snapshots for select to authenticated
using (exists (
  select 1 from public.contract_versions v join public.plans p on p.id = v.plan_id
  where v.id = contract_version_id and p.user_id = (select auth.uid())
));
create policy consent_diffs_select on public.consent_diffs for select to authenticated
using (exists (
  select 1 from public.contract_versions v join public.plans p on p.id = v.plan_id
  where v.id = contract_version_id and p.user_id = (select auth.uid())
));
create policy payment_executions_select on public.payment_executions for select to authenticated
using (exists (
  select 1 from public.contract_versions v join public.plans p on p.id = v.plan_id
  where v.id = contract_version_id and p.user_id = (select auth.uid())
));
create policy mandates_select on public.mandates for select to authenticated
using (exists (
  select 1 from public.contract_versions v join public.plans p on p.id = v.plan_id
  where v.id = contract_version_id and p.user_id = (select auth.uid())
));

grant select on public.payment_instruments to authenticated;
create policy payment_instruments_select on public.payment_instruments for select to authenticated
using (user_id = (select auth.uid()));

grant select on public.orders, public.evidence_packs to authenticated;
create policy orders_select on public.orders for select to authenticated
using (exists (
  select 1 from public.payment_executions e
  join public.contract_versions v on v.id = e.contract_version_id
  join public.plans p on p.id = v.plan_id
  where e.id = execution_id and p.user_id = (select auth.uid())
));
create policy evidence_packs_select on public.evidence_packs for select to authenticated
using (exists (
  select 1 from public.orders o
  join public.payment_executions e on e.id = o.execution_id
  join public.contract_versions v on v.id = e.contract_version_id
  join public.plans p on p.id = v.plan_id
  where o.id = order_id and p.user_id = (select auth.uid())
));
-- webhook_events: server only.

-- Ledger: the owner reads; nobody writes except internal.ledger_append ------------------------------
grant select on public.ledger_events to authenticated;
create policy ledger_events_select on public.ledger_events for select to authenticated
using (exists (select 1 from public.plans p where p.id = plan_id and p.user_id = (select auth.uid())));
