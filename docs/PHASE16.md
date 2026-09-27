# Phase 16 — ProofBench and test suites

ProofBench runs adversarial checkout mutations through the pure engine and the merchant's
agent-signature policy, and compares each result with the scenario's expected outcome. The DB
suites cover the payment guard and retries. The release gates (SDD §22.2) are shown on `/bench`.

## Commands

| Command | What it does |
|---|---|
| `pnpm bench [--db-report db-report.json] [--out dir]` | Runs every scenario and writes `bench-results/results.json` and `junit.xml`. Exits non-zero if a scenario or a gate fails. Also part of `pnpm test` (`packages/bench/src/bench.test.ts`). |
| `pnpm bench:publish [--in dir]` | Upserts `results.json` into `bench_runs`, one row per commit. Needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Without them it logs that it skipped. |
| `pnpm db:test:integration` | Includes `guard-codes.db.test.ts` (T16.4) and `retry-fuzz.db.test.ts` (T16.5). `FUZZ_SEED=n` replays a fuzz run and `FUZZ_STATS=1` prints its outcome counts. |
| `pnpm --filter @cartel/web test:a11y` | axe on every route in both themes at 1440 and 390 px. Fails on any violation. |
| `pnpm --filter @cartel/web test:keyboard` | Keyboard-only walk of the trap screens (below). |

## Scenario format (T16.1)

JSON under `packages/bench/scenarios/<category>/`. A file holds one scenario or an array of them.
The schema is in `packages/bench/src/scenario.ts`.

- `kind: "consent"` (the default) names a signed basket: `world` is `flagship` (contract v7),
  `wedding` or `carry-on`, with an optional autonomy `preset`. Its `mutation` is a list of edits:
  `price`, `offer`, `terms`, `qty`, `swap`, `add_line`, `remove_line`, `fact`, `add_fact`,
  `remove_fact`, `source`, `checkout` (shipping, tax rate, quoted total) and `order`. The live
  checkout is rebuilt from the edited lines, so offer facts, tax and the merchant quote move the
  way GreatHub's checkout would move them. `expected` holds the classification, and optionally
  the re-proof verdicts and the policy bases that must appear.
- `kind: "agent_request"` sends an ACP `complete` to the merchant's TAP policy (RFC 9421,
  tag `agent-payer-auth`, single-use nonce). The `attack` is one of `unsigned`, `replay_nonce`,
  `tampered_body`, `expired`, `unknown_key`, `wrong_tag` or `none`.

A scenario is **material** when it expects `reapprove`, `block` or a rejection.

## Scenarios (T16.2)

There are 84 scenarios, above every SDD §22.2 minimum: identity 10, same-SKU facts 12,
economics 11, terms 7, delivery 5, availability 4, recurring 4, evidence 9, derived 5,
security 10 and benign 7. 61 are material. 23 must be allowed: the benign scenarios plus the
allowed cases in other categories, such as a price drop, the 99.9 Wh boundary, and listing
injection text with no real change.

## Engine gaps the bench found

Two mutations that GreatHub's Chaos Panel can make passed the Consent Diff as `identical`:

- **Out of stock / preorder.** Availability was read but never diffed. A new `availability`
  change kind (`@cartel/contracts` `Change`) now makes `out_of_stock` **block**
  (`floor.out_of_stock`). `preorder` or `unknown` needs re-approval. `in_stock` ↔ `limited` is
  info only.
- **Pack-size shrink (shrinkflation).** Nothing read `Pack size`. It is now the core field
  `product.pack_size`, extracted from JSON-LD by all three packs. Any change to it on the same
  SKU needs re-approval (`floor.pack_size`).

SDD §7.6 and §7.7 are updated to match. With either fix reverted, those scenarios and the
`material_caught` gate fail.

## CI (T16.3)

- `database` runs the integration suite with a JSON reporter and uploads `db-report`.
- `bench` runs on every PR and push after `database`, even when `database` failed. It reads
  `db-report` into the two DB gates, uploads `bench-results` (JSON + JUnit) and writes a job
  summary. On pushes to `main` it runs `bench:publish`.
- Migration `0017_bench_gates.sql` adds `bench_runs.gates` and a unique `git_sha`, so a re-run
  replaces its row.
- **Setup needed:** add the repository secrets `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
  Until they exist, `main` builds log a skip and `/bench` shows no CI run.

## Guard suite (T16.4) and retry fuzz (T16.5)

- `guard-codes.db.test.ts` has one test per rejection code in `0007_guard.sql`:
  `idempotency_key_invalid`, `contract_not_found`, `idempotency_key_reused`,
  `contract_not_signed` (unsigned, and already executed), `contract_expired`,
  `contract_superseded`, `signature_missing`, `diff_missing`, `material_change`,
  `stale_reproof`, `over_max_total`, `instrument_invalid`, `execution_not_found`,
  `execution_token_consumed` (concurrent), `execution_token_not_consumed`,
  `execution_status_invalid` and `execution_already_completed`. It also covers concurrent
  same-key begins and retrying after a decline. Afterwards it asserts that no rejected version
  has an execution row.
- `retry-fuzz.db.test.ts` sends 200 seeded attempts in concurrent bursts across 24 signed
  contracts. The mix includes duplicate keys, rogue new-key retries, responses lost before or
  after the charge, declines followed by a retry with a new key, and replayed and racing
  webhooks through `srv_receive_greathub_event`. The fake merchant charges at most once per
  session. The test asserts one execution per key, one order per authorized execution, at most
  one charge and one order per contract, and a verifiable ledger. Five seeds were checked locally.

## Release gates (T16.7)

`releaseGates` in `packages/bench/src/gates.ts` checks: category coverage, 100% of material
mutations stopped, 0 false blocks, 0 hard passes below the evidence floor, 0 executions against
an invalid contract (guard suites) and 0 duplicate executions (retry fuzz). A gate with no
evidence reads **Not run**, never Met. `/bench` shows the gates, a per-category table and any
scenario that didn't behave as expected.

## E2E (T16.6): what is and isn't covered

- ✅ axe on every route: 0 violations of any impact, in both themes at 1440 and 390 px.
  `/workspace`, `/foundation`, `/settings/payment`, the evidence page and `/bench` (dark, with a
  run) were added to the route list.
- ✅ Keyboard-only walk of the trap screens on the demo plan: checkout → Purchase Paused (pause
  announced, Pay disabled) → revised contract review. Every focus stop has a visible ring, the
  disabled Sign button explains why, and there is no keyboard trap.
- ❌ **Not done:** the happy path (brief → sign with a virtual authenticator → Simulated rail →
  order) and the real trap path (sign → mutate → execute → paused → re-sign → pay). No UI flow
  yet drafts a signable contract version from a saved plan (docs/PHASE11.md, "Still open"), so a
  browser test would have to fake the step it is meant to prove. The guard, signing and
  checkout pieces are covered by the DB suites above and by the Phase 12 and 13 service tests.
- The a11y and keyboard scripts run against a running app (`pnpm --filter @cartel/web build &&
  … start`). They are not in CI yet.
