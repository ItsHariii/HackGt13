-- Evidence ingestion (T7.1, T7.7): snapshot cache lookups and the atomic fact writer.

-- Adapters reuse a recent snapshot of the same URL instead of calling the source again (SDD §11.6).
create index sources_url_fetched_idx on public.sources (url, source_type, fetched_at desc);

-- Applies a fact write plan computed by @proofcart/evidence (planFactWrites) in one transaction.
--
-- p_groups is an array, one entry per (subject, field):
--   { subject_kind, subject_id, field,
--     expected_current: uuid[]   -- the current (unsuperseded) fact IDs the plan was computed from
--     inserts: [{ value, raw, unit, qualifier, state, state_reason, conflict, source_id, quote,
--                 span: [start, end], extractor, retrieved_at, fresh_until, supersedes: uuid[] }],
--     flag_conflict: uuid[] }    -- existing facts that now disagree with a fresh value
--
-- Optimistic concurrency: if the current facts for a group no longer match expected_current,
-- another writer got there first and the whole call fails with `stale_fact_plan` (SQLSTATE 40001);
-- the caller re-reads and re-plans. Facts are append-only: a new reading supersedes the previous
-- reading from the same extractor, and a flagged conflict is never cleared (SDD §7.3).
create or replace function public.srv_write_facts(p_groups jsonb)
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare
  g jsonb;
  f jsonb;
  v_kind public.fact_subject_kind;
  v_subject uuid;
  v_field text;
  v_current uuid[];
  v_expected uuid[];
  v_supersedes uuid[];
  v_id uuid;
  v_updated integer;
  v_ids uuid[] := array[]::uuid[];
begin
  if jsonb_typeof(p_groups) is distinct from 'array' then
    raise exception 'invalid_fact_writes' using errcode = '22023';
  end if;

  -- One lock per subject, taken in a stable order so concurrent writers can't deadlock.
  perform pg_advisory_xact_lock(hashtextextended('facts:' || s.subject, 0))
  from (
    select distinct x ->> 'subject_id' as subject from jsonb_array_elements(p_groups) as x order by 1
  ) as s;

  for g in select value from jsonb_array_elements(p_groups) loop
    v_kind := (g ->> 'subject_kind')::public.fact_subject_kind;
    v_subject := (g ->> 'subject_id')::uuid;
    v_field := g ->> 'field';

    select coalesce(array_agg(id order by id), '{}') into v_current
    from public.facts
    where subject_id = v_subject and subject_kind = v_kind and field = v_field and superseded_by is null;
    select coalesce(array_agg(x::uuid order by x::uuid), '{}') into v_expected
    from jsonb_array_elements_text(coalesce(g -> 'expected_current', '[]')) as x;
    if v_current is distinct from v_expected then
      raise exception 'stale_fact_plan' using errcode = '40001',
        detail = format('%s %s %s', v_kind, v_subject, v_field);
    end if;

    for f in select value from jsonb_array_elements(coalesce(g -> 'inserts', '[]')) loop
      insert into public.facts (
        subject_kind, subject_id, field, value, raw, unit, qualifier, state, state_reason, conflict,
        source_id, quote, span, extractor, retrieved_at, fresh_until
      ) values (
        v_kind, v_subject, v_field,
        nullif(f -> 'value', 'null'::jsonb),
        f ->> 'raw',
        f ->> 'unit',
        f ->> 'qualifier',
        (f ->> 'state')::public.evidence_state,
        f ->> 'state_reason',
        coalesce((f ->> 'conflict')::boolean, false),
        (f ->> 'source_id')::uuid,
        f ->> 'quote',
        case when jsonb_typeof(f -> 'span') = 'array'
          then int4range((f -> 'span' ->> 0)::int, (f -> 'span' ->> 1)::int) end,
        f ->> 'extractor',
        coalesce((f ->> 'retrieved_at')::timestamptz, now()),
        (f ->> 'fresh_until')::timestamptz
      )
      returning id into v_id;

      select coalesce(array_agg(x::uuid), '{}') into v_supersedes
      from jsonb_array_elements_text(coalesce(f -> 'supersedes', '[]')) as x;
      update public.facts set superseded_by = v_id
      where id = any (v_supersedes) and subject_id = v_subject and field = v_field and superseded_by is null;
      get diagnostics v_updated = row_count;
      if v_updated <> cardinality(v_supersedes) then
        raise exception 'stale_fact_plan' using errcode = '40001',
          detail = format('supersede %s %s', v_subject, v_field);
      end if;
      v_ids := v_ids || v_id;
    end loop;

    update public.facts set conflict = true
    where id in (select x::uuid from jsonb_array_elements_text(coalesce(g -> 'flag_conflict', '[]')) as x)
      and subject_id = v_subject and field = v_field and not conflict;
  end loop;
  return v_ids;
end;
$$;
revoke all on function public.srv_write_facts(jsonb) from public, anon, authenticated;
grant execute on function public.srv_write_facts(jsonb) to service_role;
