-- Phase 16: ProofBench in CI (SDD §22.2, TASKS T16.3, T16.7). A run from `main` upserts one row per
-- commit, and carries the release gates alongside the per-scenario results so /bench can show them.

alter table public.bench_runs
  add column gates jsonb not null default '[]' check (jsonb_typeof(gates) = 'array');

-- One row per commit: re-running CI on the same commit replaces its row instead of adding another.
create unique index bench_runs_git_sha_key on public.bench_runs (git_sha);
