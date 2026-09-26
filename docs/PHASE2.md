# Phase 2 implementation and verification

Implemented September 26, 2026 against SDD §7, §12–§16 and §19, and the Phase 2 checklist in TASKS.md.

## Delivered

| Migration | Contents |
|---|---|
| `0001_core.sql` | `profiles` (auto-created for every auth user, anonymous included), `plans`, immutable `requirement_sets`, `requirements` with a generated `effective_importance` that enforces the §7.2 rule: an unconfirmed AI assumption is only ever a preference |
| `0002_catalog.sql` | `sources`, `products` (one per GTIN), `offers` (with `reference_only` for UPCitemdb-style historical prices), `facts` (`source_id not null`, `span int4range`, polymorphic subject checked by trigger). `evidence_state` enum is ordered weakest to strongest, so `>=` comparisons work. `public.is_valid_gtin` checks GS1 check digits |
| `0003_proof.sql` | `solver_runs`, `baskets`, `basket_items`, `proof_reports` (`plan` or `reproof`), one row per `proof_results` |
| `0004_consent.sql` | `contracts`, `contract_versions`, `signing_credentials`, `signing_challenges` (2-minute, single-use), `contract_signatures` (the full assertion plus the public key, so a pack verifies offline). `internal.contract_transitions` (15 edges from §7.5, plus `draft → superseded`) and the `contract_status_guard` trigger. The trigger also blocks reaching `signed` without a verified signature over the current body hash, and blocks any change to a body once it leaves `draft` |
| `0005_execution.sql` | `checkout_snapshots`, `consent_diffs`, `payment_instruments` (tokens only), `payment_executions` (unique idempotency key, at most one in flight per version), `orders`, `webhook_events` (unique per provider and event), `mandates`, `evidence_packs` |
| `0006_ledger.sql` | `ledger_events`: per-plan `seq`, SHA-256 chain under an advisory lock, UPDATE/DELETE/TRUNCATE blocked by trigger, no write grants for any role (the secret key included). `internal.verify_ledger` returns the first broken `seq`. The hash preimage is documented in the migration header for `verify.mjs` |
| `0007_guard.sql` | `internal.transition_contract` (signing a revision supersedes older open or invalidated versions), `begin_execution`, `consume_execution_token`, `complete_execution` |
| `0008_rls.sql` | RLS on every public table, deny by default: table privileges are revoked and granted back per table, then scoped to the plan owner |
| `0009_realtime.sql` | Private `plan:{id}` broadcasts for proof results, consent diffs, ledger events and contract status changes |
| `0010_jobs.sql` | Eight pgmq queues (four plus a DLQ each), Vault secrets, `mandates-tick` (15 s), `offers-refresh` (1 min), `ledger-audit` (nightly) |
| `0011_storage.sql` | `sources` and `evidence-packs` (private), `product-images` (public) |
| `0012_catalog_search.sql` | `upid`, `image_url`, weighted `search_tsv` with a GIN index, trigram index on title, `product_external_refs`, `search_queries`, kits, and `public.search_products` (full-text rank plus trigram word similarity) |
| `0013_ops.sql` | `ai_calls` (server only) and `bench_runs` (publicly readable) |
| `0100_demomart.sql` | The `demomart` schema: all 12 tables from T2.12, an offer `revision` bumped on every change (usable as an ETag), `demomart.quote()` for checkout pricing, and cron `nonce-gc` |

**Seed.** 60 DemoMart products (65 variants) under fictional brands: 25 home office, 20 apparel, 15 travel. Kits come with requirements and starter items. ProofCart's catalog is pre-ingested from the DemoMart rows, but every offer is already stale and no facts are seeded, because a fact needs a real source snapshot.

**Server access.** `internal` stays unexposed. The secret key reaches the guard, ledger and queues only through `public.srv_*` wrappers, which are `SECURITY DEFINER` and whose execute right is revoked from anon and authenticated. Errors come back as stable message codes (`contract_not_signed`, `material_change`, …).

**Types.** `pnpm db:types` writes `packages/contracts/src/db.ts` (public, exported as `@proofcart/contracts/db`) and `apps/demomart/lib/supabase/db.ts` (demomart). `pnpm db:types:check` fails CI when either file is stale.

**Integration tests.** `packages/db-tests` is a Vitest project that runs against the local stack with anonymous-user fixtures. It refuses any non-loopback URL. It is kept out of `pnpm test`; run it with `pnpm db:test:integration`.

## Verified locally

- `supabase db reset`: all 15 migrations and the seed apply cleanly.
- `supabase test db`: 101 pgTAP assertions across six files, all passing. They cover:
  - every guard rejection: `contract_not_signed`, `contract_expired`, `contract_superseded`, `signature_missing`, `diff_missing`, `material_change`, `stale_reproof`, `over_max_total`
  - an idempotent replay returning the same ID; a second token consumption failing; a key bound to one version; completing before consuming; the declined → retry path
  - `invalidated → executing` rejected; signed bodies immutable
  - a 100-event ledger that verifies; a tampered payload reported at seq 42; a deleted row detected
  - RLS enabled on every table, and user B reading, updating and deleting zero rows across every table
  - catalog GTIN validity, fictional brands only, and all four §16.1 totals ($896.05, $891.77, $881.07, $870.37)
  - "usb c monitr" returning the Vireo and Halden monitors first
  - queues, cron and Vault; a mandate tick that enqueues or expires; offers refresh; buckets; the DemoMart schema closed to clients
- `supabase db lint --fail-on warning`: clean. The lint caught a real bug in `offers_refresh`, where a set-returning `pgmq.send` sat inside `count()`. It is fixed and now covered by a test.
- `pnpm db:test:integration`: 14 tests through PostgREST and Realtime. They cover the guard lifecycle over RPC, rejection codes, clients blocked from the wrappers, RLS between two anonymous users, owner-only private broadcasts (the intruder gets `CHANNEL_ERROR`), and seeded kit requirements parsing with the contracts `Requirement` schema.
- `pnpm typecheck` (15/15) and `pnpm test` (106) pass. `pnpm db:types:check` passes.

The full `pnpm build` was not re-run. The only app-side change is the generated `apps/demomart/lib/supabase/db.ts`, which typechecks.

## Decisions and deviations

- **Guard fixes against the §13.5 sketch.**
  - The sketch checked contract status before idempotency, so a replay after `executing` would have raised `contract_not_signed` instead of returning the execution. The guard now takes the row lock, checks idempotency, and only then checks status.
  - A missing diff produced a `null` classification, and `null not in (…)` is not true, so the sketch would have passed it. That case now raises `diff_missing`.
  - Retries from `failed` are allowed, as the state machine permits.
- **`payment_executions.diff_id` uses NO ACTION, not RESTRICT.** With RESTRICT, deleting a plan that had a payment could fail partway through the cascade. A test covers plan deletion through paid orders.
- **The ledger has no foreign key to plans.** Deleting a plan leaves its events verifiable but unreadable (RLS joins through plans), which is how "anonymized, chain intact" from §20.3 is honored. Payloads must never carry personal data.
- **Cron wake-ups sign only `{timestamp}.{queue}`** (HMAC-SHA256, header `x-proofcart-signature: v1=…`), so body serialization can never break verification. Both Vault secrets start as `unset`, and jobs skip the wake-up until they are configured.
- **`demomart` is exposed through PostgREST to service_role only** (`config.toml` `api.schemas`). Supabase secret keys all map to service_role, so the ProofCart and DemoMart split is enforced by code, not by the database. Hard isolation would need a separate Supabase project.
- **Seed alignment with Phase 3 fixtures.** Flagship SKUs match `packages/contracts/src/fixtures/flagship.ts` (`BL-CD-465`, `KS-MESH-TASK`, `M27Q-USBC`, `LOOP-C100-2M`, `PICA-1080`), and the GTIN numbering matches. The fixture's GTINs have invalid GS1 check digits; the database uses the valid ones: Halden `00812345000016`, desk `00812345000108`, chair `00812345000207`, cable `00812345000405`, webcam `00812345000504`.

## Remaining

- Cloud migration push, which is still blocked by the Phase 1 cloud setup. After `supabase db push --include-seed`:
  - add `demomart` to the dashboard's exposed schemas
  - set the Vault `worker_url` and `worker_hmac_secret`
- The storefront and JSON-LD rendering for T2.13 are Phase 6.
- If a teammate regenerates `packages/contracts/package.json`, keep the `./db` export.
