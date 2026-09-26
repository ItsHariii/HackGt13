# ProofCart — Build Plan & Checklists

Companion to [`SDD.md`](./SDD.md). Section references like **§13.5** point to the design doc. Mockups come from Claude Design using [`DESIGN_PROMPT.md`](./DESIGN_PROMPT.md).

---

## How to use this document

- Each task has an **ID**, an **owner lane**, its **dependencies** and its **acceptance criteria**. Check a box only when the acceptance criteria are met.
- **Build the spine first.** At every gate the end-to-end flow must work, even if it looks rough. Polish comes after the spine is green.
- Branching: `git checkout -b <lane>/<task-id>-<slug> --no-track origin/main`. Keep PRs small, merge to `main` often, and never push straight to `main`.
- Each commit and PR says what changed and why.

### Lanes

| Lane | Owns | If the team is smaller |
|---|---|---|
| **P**: Platform | Supabase, infra, CI, signing, guard, payments, mandates | 3 people: P also takes the payment side of M |
| **E**: Engine | `contracts`, `proof-engine`, `rule-packs`, `solver`, `bench` | 2 people: E + P merge; F + M merge |
| **F**: Frontend | Every ProofCart screen including Explore, wiring, accessibility | — |
| **M**: Merchant + AI | DemoMart, ACP, TAP, evidence and catalog adapters, AI layer, demo production | 3 people: M splits into P (DemoMart/ACP/TAP) and F (AI UX) |
| **D**: Design + delight | Claude Design mockups, paper-and-doodle system, the cast and micro-interactions (`components/doodle`) | 4 people: F owns D; M helps after G3. With 5 people, D is its own lane. |

### Timeline and gates (H0 = hacking start; about 36 h total)

| Gate | Hour | Must be true |
|---|---|---|
| **G0** | H+1.5 | Accounts created, Visa questions asked, v0 schemas frozen, lanes assigned |
| **G1** | H+6 | Both apps deployed to production domains; migrations applied; packages compile in CI; DemoMart catalog seeded; Realtime spike works |
| **G2**, spine green | H+14 | Form-entered requirements → proof report → contract → **passkey sign** → execute through ACP → **Visa Acceptance sandbox authorization** → order. A Chaos Panel `spec_edit` **blocks** payment. |
| **G3** | H+22 | AI layer, solver, Realtime proof streaming, mandates, and the core screens in the paper theme. Explore search works across ≥ 2 live sources; the product page shows specs with receipts. |
| **G4**, feature freeze | H+28 | ProofBench ≥ 60 scenarios green; Evidence Pack; ledger verification; TAP and ACP badges; all screens have their states; Scout, Inspector, Notary and Guard wired to real events with reduced-motion parity |
| **G5** | H+32 | Three timed rehearsals; backup video recorded; Devpost draft complete |
| **Submit** | H+35 | Submitted with 1 h of buffer |

```
Hour:   0    2    4    6    8   10   12   14   16   18   20   22   24   26   28   30   32   34  36
P   : [0][--Foundation--][--DB/guard--][sign][--payments--][mandates][hardening][---demo---]
E   : [0][contracts][---proof-engine---][packs][--solver--][--bench--][tests][polish][-demo-]
F   : [0][shell/design][--screens (mock data)--][wire real data][paused/diff][states][a11y][demo]
M   : [0][demomart][ACP][TAP][chaos][shopify/upc/icecat][search][--AI layer--][evidence][demo prod]
D   : [0][mockups][tokens+paper][marks+stamps][figure engine][poses][Scout/Inspector][Notary/Guard][polish][demo]
                    G1 ▲             G2 ▲                     G3 ▲       G4 ▲       G5 ▲    ▲ submit
```

Lane D does **not** block the spine. Until G2, D produces mockups, tokens and isolated components only; wiring figures into screens starts after G2.

---

## Phase 0: Hour zero (everyone, ≤ 90 min)

- [ ] **T0.1 Visa sponsor table** (M, with P) — no dependencies
  - [ ] Ask for the judging rubric and what "meaningful Visa integration" means to them.
  - [ ] Ask whether hackathon teams can get **Visa Intelligent Commerce / MCP sandbox credentials**, and how fast.
  - [ ] Confirm that the **Visa Acceptance (Cybersource) sandbox** counts as a Visa integration.
  - [ ] Write the answers into SDD §27 and adjust the demo emphasis.
- [ ] **T0.2 Accounts and keys** (P) — no dependencies
  - [ ] Supabase: two projects, `proofcart-dev` and `proofcart-prod` (same region, US East).
  - [ ] Vercel: two projects, `proofcart-web` and `demomart`.
  - [x] OpenAI API key (primary AI), with a hard spend limit on the project ($10 credit).
  - [x] Meta Model API key (Muse Spark, fallback AI) from the Meta developer console ($50 credit).
  - [ ] Set spend limits on both before the first call; keep the demo profile (`gpt-6-sol`) off until rehearsals (SDD §10.4).
  - [x] **Visa Acceptance sandbox** account → merchant ID, REST key ID, shared secret.
  - [x] **Authorize.net sandbox** account (fallback rail): API login ID, transaction key, public client key.
  - [x] ~~**Best Buy** developer API key~~: access not granted; replaced by **UPCitemdb** (keyless trial, no signup; optional paid key).
  - [x] **Icecat** account (Open Icecat) → username and API token.
  - [ ] eBay is optional: production Buy API access is partner-only, so don't wait on it.
  - [ ] Sentry project(s).
  - [ ] Domain: `proofcart.<tld>` + `demomart.<tld>` (check whether HackGT offers free domains).
  - [ ] Store every secret in a shared password manager, **never in git**.
- [ ] **T0.3 Schema freeze v0** (E leads, all attend, 45 min) — no dependencies
  - [ ] Agree on `Requirement`, `Fact`, `EvidenceState`, `ProofResult`, `ProofReport`, `ContractBody`, `Change`, `ConsentDiff` and `AutonomyPolicy` exactly as in SDD §7.2, §8.4, §12.1 and §7.7.
  - [ ] E pushes them as Zod stubs in `packages/contracts` within the hour so every lane codes against them.
- [ ] **T0.4 Key material** (P) — depends on T0.2
  - [ ] Script `scripts/gen-keys.ts`: Ed25519 agent key and grant key as JWKs, plus HMAC secrets for the queue worker and webhooks.
  - [ ] Put them in the Vercel env (prod and dev) and in local `.env.local` files (gitignored).
- [ ] **T0.5 Mockups in Claude Design** (D) — no dependencies; runs in parallel through about H+3
  - [ ] Paste the master prompt from `DESIGN_PROMPT.md`, then the per-screen follow-ups in order.
  - [ ] Export or record the final tokens (colors, type scale, spacing, radii, shadows) and screenshots of every screen into `docs/mockups/`.
  - [ ] Review the mockups with the whole team in 10 minutes: does the contract screen look trustworthy? Is status readable without color?
  - ✅ Mockups exist for: landing, explore, search results (loading + loaded), product page, requirements review, workspace, contract, purchase paused, paid receipt, bench, and mobile workspace.
- [ ] **T0.6 Shopify UCP catalog spike** (M, 60 min) — no dependencies
  - [ ] Publish a draft agent profile at the well-known URL the Shopify docs specify; call `search_catalog` and `get_product` on `catalog.shopify.com/api/ucp/mcp` for "navy linen shirt" and "27 inch 4K USB-C monitor".
  - [ ] Record which fields come back (price, variants, availability, attributes, images, UPID, shop, checkout link) and the rate-limit behavior in SDD §27.
  - ✅ Go/no-go on Shopify as a live source. If no-go, UPCitemdb + Icecat + DemoMart carry Explore and apparel falls back to DemoMart data.
- [ ] **G0 check**: accounts done, questions asked, schemas pushed, lanes assigned, mockups underway.

---

## Phase 1: Foundation (P lead)

Implementation update (2026-09-26): local foundation is implemented and verified. Cloud deployment, project linking, Google OAuth credentials, required GitHub checks, and Sentry delivery remain pending. See [README](../README.md) for setup and [verification notes](PHASE1.md).

- [x] **T1.1 Monorepo scaffold** (P) — depends on T0.3
  - [x] `pnpm` 10 workspaces with `apps/*` and `packages/*`; Turborepo pipeline (`build`, `dev`, `test`, `typecheck`, `lint`).
  - [x] `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; app `@/*` aliases and shared package exports.
  - [x] Biome config at the root; Vitest test-project workspace config.
  - [x] Node 24 LTS pinned via `.nvmrc` and `engines`.
  - ✅ Install, typecheck, tests, and credential-free production builds verified. Domain packages are module boundaries; Phase 0 schema freeze and later implementations remain separate work.
- [ ] **T1.2 `apps/web` scaffold** (F) — depends on T1.1
  - [x] Next.js **16.3.6** App Router, TypeScript, Turbopack.
  - [x] Tailwind v4; shadcn config and Radix-based button; `next/font` Source Serif 4, Geist Sans, Geist Mono; `next-themes` paper/blueprint themes.
  - [x] Base layout, top nav, 404 and error boundaries; responsive landing and workspace shell.
  - [ ] Deploy to a Vercel preview.
- [ ] **T1.3 `apps/demomart` scaffold** (M) — depends on T1.1
  - [x] Next.js on port 3001, distinct Tailwind theme and persistent "Test merchant" banner.
  - [ ] Deploy to a Vercel preview.
- [ ] **T1.4 Supabase init** (P) — depends on T0.2
  - [x] `supabase init`; local Docker stack running; `config.toml` checked into the scaffold.
  - [ ] Link the cloud dev project.
  - [x] Enable `pgcrypto`, `pg_cron`, `pgmq`, `pg_net`, `pg_trgm` through `0000_foundation.sql`. Optional `vector` deferred.
  - [x] Local anonymous sign-ins, email auth, and manual identity linking enabled.
  - [ ] Configure and enable Google OAuth when credentials are available; configure equivalent cloud Auth settings.
  - [x] New publishable/secret API keys used for local verification.
  - [x] Local Data API exposes `public` only.
- [x] **T1.5 Supabase clients** (P) — depends on T1.2, T1.4
  - [x] Cookie SSR client, server-only admin client, singleton browser client.
  - [x] `proxy.ts` refreshes sessions and propagates `x-request-id`.
  - ✅ Browser-created anonymous identity survives reload.
- [ ] **T1.6 CI** (P) — depends on T1.1
  - [x] `.github/workflows/ci.yml`: locked install, Node 24, typecheck, Biome, Vitest, app builds, local database lint and permission tests. ProofBench deferred to T16.
  - [ ] Set `quality` and `database` as required PR checks in GitHub settings; verify hosted workflow execution.
- [ ] **T1.7 Production deploys and domains** (P) — depends on T1.2, T1.3
  - [ ] Assign custom domains and verify HTTPS for both apps.
  - [ ] Set Vercel environment variables per SDD §24.
  - [x] App-specific env templates and deployment instructions provided.
- [ ] **T1.8 Observability** (P) — depends on T1.2
  - [x] Sentry 11 SDK in both apps, request-error tags, development-only diagnostic endpoint, Pino redaction, request-ID propagation.
  - [ ] Send and verify a Sentry event after DSNs are configured.
- [x] **T1.9 Realtime spike** (P) — depends on T1.4, T1.5
  - [x] Owner-only private `plan:{id}` channels, RLS on `realtime.messages`, trigger calling `realtime.send()`, browser receiver.
  - [x] Dedicated `foundation_*` tables; cleanup control; one-second polling fallback labeled separately.
  - ✅ Five direct-client broadcasts measured 5–42 ms; browser receipt measured 16 ms. A second user was rejected from the channel. Local SQL permission tests passed.
- [x] **T1.10 Health endpoints** (P) — `/api/health` in both apps: DB RPC, env sanity, reachable JWKS, propagated request ID. Both returned HTTP 200 with isolated local test configuration; missing dependencies return 503.
- [ ] **G1 check** (H+6) — cloud deployments and Phase 2 canonical catalog are still required.

---

## Phase 2: Database (P lead, E reviews)

All migrations go in `supabase/migrations/`, numbered. Each one must pass `supabase db reset` locally.

- [x] **T2.1 `0001_core.sql`**: `profiles`, `plans`, `requirement_sets`, `requirements` (SDD §19.2)
- [x] **T2.2 `0002_catalog.sql`**: `products`, `offers`, `sources`, `facts` (with `source_id not null`, the `span int4range`, and indexes on `(subject_id, field)` and `fresh_until`)
- [x] **T2.3 `0003_proof.sql`**: `solver_runs`, `baskets`, `basket_items`, `proof_reports`, `proof_results`
- [x] **T2.4 `0004_consent.sql`**: `contracts`, `contract_versions`, `signing_credentials`, `signing_challenges`, `contract_signatures`
  - [x] Table `contract_transitions(from_status, to_status)` seeded from the state machine in SDD §7.5.
  - [x] Trigger `contract_status_guard`: rejects any `status` update not listed in `contract_transitions`.
  - ✅ Test: a direct `update … set status='executing'` from `invalidated` raises an error.
- [x] **T2.5 `0005_execution.sql`**: `checkout_snapshots`, `consent_diffs`, `payment_instruments` (no PAN columns), `payment_executions` (with `idempotency_key unique`), `orders`, `webhook_events` (unique on `(provider, event_id)`), `mandates`
- [x] **T2.6 `0006_ledger.sql`**: `ledger_events`, `internal.ledger_append`, `internal.verify_ledger`
  - [x] Advisory lock per plan; hash chain via `pgcrypto.digest`.
  - [x] `revoke update, delete`, plus a trigger that raises on update or delete.
  - ✅ Test: append 100 events, then verify returns null. Tamper with a payload as a superuser, and verify returns the broken `seq`.
- [x] **T2.7 `0007_guard.sql`**: `internal.begin_execution`, `internal.consume_execution_token`, `internal.complete_execution`, `internal.transition_contract` (SDD §13.5)
  - ✅ Integration tests, one per rejection: `contract_not_signed`, `contract_expired`, `contract_superseded`, `signature_missing`, `material_change`, `stale_reproof`, `over_max_total`, plus an idempotent replay returning the same ID and a second token consumption failing.
- [x] **T2.8 `0008_rls.sql`**: RLS enabled on **every** `public` table; policies per SDD §19.3; indexes on the columns the policies use
  - ✅ Test: user B cannot read or modify any of user A's rows, through every table.
- [x] **T2.9 `0009_realtime.sql`**: broadcast triggers on `proof_results`, `consent_diffs` and `ledger_events`; `realtime.messages` policies
- [x] **T2.10 `0010_jobs.sql`**: pgmq queues (`q_mandate_eval`, `q_fact_refresh`, `q_webhooks`, `q_evidence_pack` and a `_dlq` for each); Vault secrets `worker_url` and `worker_hmac_secret`; cron jobs `mandates-tick` (15 s), `offers-refresh` (1 min), `ledger-audit` (nightly)
- [x] **T2.11 `0011_storage.sql`**: buckets `sources` (private), `evidence-packs` (private), `product-images` (public), with policies
- [x] **T2.12 `0100_demomart.sql`**: schema `demomart`
  - [x] Tables: `sellers`, `products`, `variants`, `listings` (spec jsonb, **mutable**), `offers`, `policies`, `checkout_sessions`, `orders`, `mutation_log`, `tap_nonces`, `agent_log`, `webhook_outbox`.
  - [x] Cron `nonce-gc` (10 min).
- [ ] **T2.13 `seed.sql`**: the DemoMart catalog (M writes the data, P wires it). **Fictional brands only.** The flagship items and prices must match the canonical demo dataset in SDD §16.1 exactly.
  - [x] **Home office** (about 25 products): Birchline desks at 44", 46.5", 48", 52" widths; Kestrel chairs with and without adjustable lumbar; **Vireo U2727** (27" 4K, USB-C up to 90 W, $329), **Halden M27Q-USBC** (27" 4K, 65 W, $309) and a few other monitors; Loop USB-C cables at 60 W / 100 W / 240 W; Pica webcams; docks.
  - [x] **Apparel** (about 20): Marlow navy dresses and suits with **garment measurements**, the Marlow Navy Wrap Dress ($168, can flip to final sale at $118), Aster heels, fiber blends (including a heather variant with polyester), return policies with and without fees.
  - [x] **Travel** (about 15): Fieldnote 21" (21.5 × 14 × 9 in) and Atlas "International" (10.8 in deep) carry-ons, Volt power banks at 10k / 20k / 26.8k / 30k mAh (some with Wh stated, some without), adapters, toiletry bottles.
  - [x] **Kits**: "Starter home office", "Wedding guest", "Carry-on kit" with their requirements and starter items.
  - [ ] Every product has a GTIN, a brand, an MPN and spec fields that match its JSON-LD. (GTIN/brand/MPN/spec done and tested; JSON-LD is rendered in Phase 6.)
  - ✅ `supabase db reset` loads everything; the storefront renders it; the flagship basket totals $896.05.
  - Seed loads and totals verified (`demomart.quote` = $896.05 / $891.77 / $881.07 / $870.37). Storefront rendering is open until Phase 6.
- [x] **T2.14 Type generation**: `pnpm db:types` → `packages/contracts/src/db.ts`; CI fails if the types are stale
- [x] **T2.15 Bootstrap DB integration tests**: a Vitest project that runs against local Supabase with helper fixtures (users, plans, signed contracts)
- [x] **T2.16 `0012_catalog_search.sql`**: `products.upid`, `products.image_url`, generated `search_tsv` + GIN index, trigram index on `title`; tables `product_external_refs` (unique `(source, external_id)`), `search_queries`, `kits`, `kit_requirements`, `kit_items`; catalog and kits readable by `anon` and `authenticated` (SDD §19.3)
  - ✅ A search for "usb c monitr" (typo) returns the Vireo and Halden monitors from seed data.

---

## Phase 3: `packages/contracts` (E)

- [x] **T3.1 Zod schemas** — depends on T0.3
  - [x] `Quantity`, `Money`, `EvidenceState`, `FieldRef`, `Requirement`, `Fact`, `Offer`, `Basket`, `ProofResult`, `ProofReport`, `ContractBody`, `Change`, `ConsentDiff`, `AutonomyPolicy`, `Mandate`, `ScopedPaymentGrant`, `RequirementPatch`.
  - [x] Inferred TS types exported; no `any`.
- [x] **T3.2 Canonicalization and hashing**
  - [x] `canonicalize()` (RFC 8785 via the `canonicalize` package), `sha256Hex()` via Web Crypto (works in Node, browser and Deno).
  - [x] `contractHash(body)`, `reportHash(report)`, `factsDigest(facts)`.
  - ✅ The RFC 8785 test vectors pass; the hash is stable under key reordering (property test).
- [x] **T3.3 AP2 export**: `toAp2(contract, signature)` → `{ intentMandate, cartMandate }` per SDD §12.4, with a snapshot test
- [x] **T3.4 UI copy mapping**: `evidenceLabel(state, source, age)` and `verdictLabel()`, shared by the web app and the PDF

Implementation notes and deviations: [PHASE3.md](PHASE3.md).

---

## Phase 4: `packages/proof-engine` + `packages/rule-packs` (E)

- [x] **T4.1 Units and parser** — depends on T3.1
  - [x] Base units (mm, g, W, Wh, mAh, ml), decimal math, per-field tolerance.
  - [x] A grammar for `65W`, `65 watts`, `up to 90 W`, `46.5"`, `46.5 in`, `118 cm`, `20,000mAh`, `3.4 oz`, `100ml`, and ranges.
  - [x] Qualifiers (`up_to`, `approx`, `max`, `min`) are preserved.
  - ✅ ≥ 40 table-driven test cases, including bad input returning `null` rather than throwing.
- [x] **T4.2 Money**: integer minor units, safe add and compare, tax-rate application with explicit rounding (banker's rounding documented)
- [x] **T4.3 Evidence lattice**: ordering, `min()`, derived-state rules (assumption caps at `estimated`), conflict handling via authority precedence, and freshness (`now` is injected)
- [x] **T4.4 Verdict function**: operators (`eq neq gte lte between in not_in contains excludes before compatible_with exists`) and the **weak-fail / strong-pass** rule from SDD §7.4
  - ✅ Unit tests for every operator × verdict path.
- [x] **T4.5 Scope evaluation**: item, pair, basket (totals computed from lines and compared with the merchant total), merchant, order
- [x] **T4.6 Report builder**: deterministic ordering, summary counts, `hash`, `engineVersion`, pack versions
- [x] **T4.7 Pack API**: `definePack` with `fields`, `jsonLd` map, `roles` (including `requiredWhen`), `pairs`, `derive`, `defaults`; pack validation at load time
- [x] **T4.8 `home-office` pack v1**: fields, JSON-LD map, roles (desk, chair, monitor, dock?, cable?, webcam?), pair rule (dock↔monitor video), cable PD rule, defaults (budget, deadline)
  - ✅ The flagship fixtures produce the expected report: U2727 passes, U2727E fails on PD, comfort is `unknown (subjective)`.
- [x] **T4.9 `apparel` pack v1**
  - [x] Garment-measurement fit vs a reference garment (± tolerance); body chart → `estimated`.
  - [x] Fiber constraints; `final_sale == false`; return fee ≤ X.
  - [x] **Exchange buffer**: `delivery_latest + return_transit + reship ≤ event_date`.
  - [x] Color is `source_stated`; fit and looks are `unknown (subjective)`.
  - ✅ The final-sale flip scenario fails `returnable`.
- [x] **T4.10 `travel` pack v1**
  - [x] Bag dimensions checked orientation-aware (sort both triples, compare axis by axis).
  - [x] Derived `Wh = mAh × V / 1000`, with an assumed 3.7 V capping the state at `estimated`; ≤ 100 Wh.
  - [x] Plug type, voltage range, liquids ≤ 100 ml.
  - ✅ 20k mAh → 74 Wh (estimate) passes; 30k mAh → 111 Wh fails; the 10.8" "international carry-on" fails a 9" limit.
- [x] **T4.11 Consent Diff**: `consentDiff()` and `classify()` with the Strict/Balanced/Flexible presets and the **policy floor** (SDD §7.6 and §7.7)
  - ✅ Same-SKU spec edit → `block`; webcam −$4 → `auto` (Balanced); seller rotation → `reapprove`; final-sale flip → `block`. Totals match SDD §16.1 ($891.77 after the webcam change; $881.07 in the blocked state).
- [x] **T4.12 Property tests** (fast-check): invariants 1–9 from SDD §22.1
- [x] **T4.13 Explanation templates**: reason code → sentence, with values interpolated from the result
- [x] **T4.14 Purity guard**: Biome `noRestrictedImports` in `proof-engine`, `rule-packs` and `solver` (no `fetch`, supabase, `ai`, `node:fs`, `Date.now`)

Implementation notes and deviations: [PHASE4.md](PHASE4.md).

---

## Phase 5: `packages/solver` (E)

- [x] **T5.1 HiGHS integration**: load the `highs` WASM in Node (and optionally the browser); solve a toy MILP in a test
- [x] **T5.2 Model builder**: variables, constraints and objective per SDD §9.1 (roles, quantities, budget with shipping per merchant, a linearized tax rate, pair incompatibility, merchant usage, a maximum merchant count)
- [x] **T5.3 Top-3 diverse plans**: no-good cuts; each plan labeled with its main tradeoff (computed from which preferences differ)
- [x] **T5.4 Exhaustive fallback**, plus a property test that the solver optimum equals the exhaustive optimum on random small instances
- [x] **T5.5 Minimal conflict set**: a deletion filter over the hard basket-level requirements, then bisection for the smallest relaxation per member
  - ✅ The fixture "budget $900 + Monday" returns the conflict `{budget, delivery}` with the deltas `+$84` and `Wednesday`.
- [x] **T5.6 Performance test**: 8 roles × 15 candidates, top 3 in < 300 ms p50 in CI

Implementation notes and deviations: [PHASE5.md](PHASE5.md).

---

## Phase 6: DemoMart (M)

Implementation notes: [PHASE6.md](PHASE6.md). T6.10 stays open for the Gremlin figure (needs T10B).

- [x] **T6.1 Storefront**: catalog grid, product pages at `/p/[slug]` with visible specs and `<script type="application/ld+json">` (schema.org `Product` + `Offer` + `additionalProperty`), the "Test merchant" banner
- [x] **T6.2 Product JSON API**: `GET /api/products/[id]` (requires an agent signature once T6.5 lands)
- [x] **T6.3 ACP endpoints** — depends on T8.3
  - [x] `POST /acp/checkout_sessions`, `POST /acp/checkout_sessions/{id}`, `GET /acp/checkout_sessions/{id}`, `POST …/complete`, `POST …/cancel`.
  - [x] Headers: honor `Idempotency-Key`, echo `Request-Id`, require `API-Version: 2025-09-12`.
  - [x] Totals computed server-side (`items_base_amount`, `subtotal`, `fulfillment`, `tax`, `fee`, `total`); statuses; `messages[]` for errors (`out_of_stock`, `invalid`, `payment_declined`).
  - ✅ Contract tests in `packages/acp` pass against DemoMart.
- [x] **T6.4 `x_proofcart` extension** on line items: seller ID, GTIN, `final_sale`, return policy, spec URL
- [x] **T6.5 TAP verifier middleware** — depends on T8.1
  - [x] Parse `Signature-Input` / `Signature`; enforce the window (≤ 8 min, `created` in the past, `expires` in the future); nonce replay check in `tap_nonces`; fetch JWKS with a 5 min cache; verify Ed25519; verify `Content-Digest` for bodies.
  - [x] Every request is logged to `agent_log` (key ID, tag, verdict, reason).
  - ✅ An unsigned request gets 401; a replayed nonce gets 401; a valid one passes.
- [x] **T6.6 Agent Log page** `/agents`: a live table (Realtime or 1 s poll) with ✓/✗, key ID, tag and path
- [x] **T6.7 Grant and contract verification on `/complete`**
  - [x] Verify the `ScopedPaymentGrant` JWS against the ProofCart JWKS (merchant origin, amount ≤ max, not expired, contract hash present).
  - [x] Verify the included WebAuthn assertion against the included public key (expected origin and RP ID are ProofCart's).
  - [x] Show "✓ Customer-signed contract v{n} · {hash}" on the merchant order.
- [x] **T6.8 Charging** — depends on T13.1
  - [x] Call `POST /pts/v2/payments` (Visa Acceptance sandbox) with the instrument, `capture: true`, `clientReferenceInformation.code = contractId@v`, and `merchantDefinedInformation` = [contract ID, body hash, grant ID].
  - [x] Map decline and error codes to ACP `messages[]`.
- [x] **T6.9 Order webhooks out**: `order_created` / `order_updated` → ProofCart, HMAC `X-Signature` + timestamp; outbox with retries (1s, 5s, 30s)
- [ ] **T6.10 Chaos Panel** `/chaos` (admin token)
  - [x] One button per mutation from SDD §16, each with a parameter form (for example, the new PD watts).
  - [x] **Scenario scripts**: "Flagship deal trap" (Vireo `U2727`: price $329 → $319 **and** USB-C power 90 → 15 W on the same SKU), "Webcam −$4", "Final-sale trap", "Seller rotation", "Injection listing".
  - [ ] The Gremlin figure appears next to each mutation in the log (after T10B lands).
  - [x] **Reset** restores the seed state; **Run mandate tick now** calls ProofCart's worker.
  - [x] Mutation log shown live.
  - ✅ Each mutation is visible on the product page and through the ACP GET within 1 s.
- [x] **T6.11 Mock recall endpoint** (demo mode only, labeled "Mock CPSC (demo)") for the `recall_posted` mutation
- [x] **T6.12 Merchant orders page**: amount, Visa transaction ID, verification badges (agent ✓, grant ✓, contract signature ✓)

---

## Phase 7: `packages/evidence` (M)

- [x] **T7.1 Snapshotter**: `snapshot(url | response)` → sha256 → Storage `sources/{hash}` → `sources` row; content-type aware
- [x] **T7.2 JSON-LD extractor**: parse `application/ld+json`; map fields using the pack's `jsonLd` paths; unit-parse; produce `Fact`s with state set by authority (merchant JSON-LD → `source_stated`; checkout API price → `verified`)
- [x] **T7.3 DemoMart adapter**: a TAP-signed client (`packages/tap`) + ACP client (`packages/acp`); `refreshOffer`, `refreshSpecs`, `getCheckout`
- [x] **T7.4 CPSC adapter**: `GET https://www.saferproducts.gov/RestWebServices/Recall?format=json&ProductName=…`, matched by brand and model; fact `recall.active` with state `verified`; label "No recall found as of {t}"
- [ ] **T7.5 Shopify adapter (UCP)** — depends on T0.6 going "go"
  - [x] MCP client for `catalog.shopify.com/api/ucp/mcp`: `search_catalog`, `lookup_catalog`, `get_product`; requests reference ProofCart's agent profile.
  - [x] Map products (UPID, title, images, shop), variants (options, availability, price) and attributes onto `products`, `offers`, `facts` (state `source_stated`, source "Shopify Catalog").
  - [x] Back off on rate limits; results cached through `search_queries`. *(Responses are cached as `sources` snapshots; the `search_queries` row is written by T7B.3.)*
  - ✅ "navy linen shirt" returns ≥ 10 real products with price, variants and at least one fiber fact where the listing provides it.
- [x] **T7.6 Quote-grounded extraction (A3)** — depends on T9.1
  - [x] Normalize the source text (whitespace/Unicode only); verify the quote exists at an index; the parsed value must equal the claimed value; store `quote` and `span`; cap at `source_stated`.
  - ✅ Tests: an invented quote is rejected; a misread number is rejected; a valid quote is stored with the correct span.
- [x] **T7.7 Fact store writer**: supersede old facts; detect conflicts (same field, different value, both fresh) → set the `conflict` flag; apply authority precedence
- [x] **T7.8 Refresh worker**: a `q_fact_refresh` consumer; offers for active contracts refreshed by cron
- [x] **T7.9 UPCitemdb adapter** (replaces Best Buy): `prod/trial/search?s=` and `prod/trial/lookup?upc=` (switch to `prod/v1` + `user_key` header when `UPCITEMDB_USER_KEY` is set); map GTIN, brand, model, category, images; each retailer offer becomes a reference offer with `merchant`, `price`, `availability` and `observed_at` from `updated_t`; read `X-RateLimit-Remaining` and stop at 5; cache every response in Supabase
  - ✅ "27 inch 4K USB-C monitor" returns real monitors with GTIN, brand and model; offers render as "Seen at {merchant} · last seen {date}" and never feed price rules.
- [x] **T7.10 Icecat enrichment**: on product upsert with a GTIN, fetch the manufacturer spec sheet from `live.icecat.biz/api`; write facts with source type `manufacturer`; conflicts with seller specs set the `conflict` flag
  - ✅ At least one UPCitemdb monitor (matched by GTIN) shows a manufacturer-sourced spec row, and a seeded conflict renders as **Sources disagree**.
- [ ] **T7.11 Open Food Facts adapter** *(stretch, grocery pack)*: `api/v2/product/{barcode}.json` with a descriptive User-Agent; allergens and ingredients as facts
- [ ] **T7.12 eBay adapter** *(optional)*: only if partner access is granted; otherwise skip entirely

Implementation notes, verification and open items: [PHASE7.md](PHASE7.md). T7.5 stays open until the live "navy linen shirt" check runs against a deployed agent profile.

---

## Phase 7B: `packages/catalog` — search, product pages, kits (M + E)

Implementation and source-policy exceptions: [PHASE7B.md](PHASE7B.md). UI rendering remains Phase 11.

- [x] **T7B.1 Normalization**: one mapper per source onto `products` / `offers` / `facts` using the pack ontology and the unit parser; unmapped attributes are stored untyped and never feed rules
- [x] **T7B.2 Identity resolution**: merge on GTIN, then Shopify UPID, then brand + MPN; `product_external_refs` for every persisted source record (Shopify content remains transient under its usage rules)
  - ✅ The same monitor from UPCitemdb and Icecat resolves to one product with two sources (merge on GTIN).
- [x] **T7B.3 Federated search** `GET /api/search`: parallel fan-out to enabled catalog sources with a 2.5 s timeout per source; NDJSON streaming (`{source, status, products[]}` per source); cache persisted sources in `search_queries` for 10 min (Shopify uncached); ranking = full-text rank + trigram similarity + boost for passing the active plan's hard rules
  - API timeout isolation tested; local first-source latency checked by `pnpm test:catalog`. Deployed p95 and UI timeout rendering remain Phase 11 verification.
- [x] **T7B.4 Facets**: derived from the pack ontology for the detected category; counts per facet value; exposes `promoteToRule(field, op, value, 'facet', { role, packs })`
- [x] **T7B.5 Product API** `GET /api/products/[id]`: product, offers per source, spec rows with evidence state, source, age and conflict flag; item-scope proof against the active plan
- [x] **T7B.6 Kits**: `forkKit(slug)` copies kit requirements (as `pack_default`) and starter items into a new plan
- [x] **T7B.7 Checkout tier resolver**: per offer → `full` (DemoMart), `handoff` (Shopify), `proof_only` (UPCitemdb offers and others); exposed on product and plan APIs

---

## Phase 8: `packages/tap` + `packages/acp` (M, P reviews)

Implementation notes: [PHASE8.md](PHASE8.md).

- [x] **T8.1 RFC 9421 signer and verifier**
  - [x] Signature base for `@method`, `@authority`, `@path` and `content-digest`; parameters `created`, `expires`, `keyid`, `alg="ed25519"`, `nonce`, `tag`.
  - [x] Ed25519 via Web Crypto (fallback `@noble/curves`).
  - [x] `Content-Digest: sha-256=:…:` (RFC 9530).
  - ✅ The RFC 9421 Appendix B Ed25519 test vector passes; a round-trip sign/verify property test passes.
- [x] **T8.2 JWKS**: `GET /.well-known/jwks.json` on ProofCart (agent key + grant key, `kty: OKP`, `crv: Ed25519`); cache headers; key rotation supported through `kid`
- [x] **T8.3 ACP types and client**: request/response types for API-Version `2025-09-12`, automatic `Idempotency-Key` and `Request-Id`, and error mapping to typed results

---

## Phase 9: `packages/ai` (M)

- [ ] **T9.1 Model router**
  - [ ] AI SDK 7 (`ai`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible`); `generateText`/`streamText` with `output: Output.object()` (never `generateObject`).
  - [ ] Providers from env: `AI_PROVIDER=openai` (`OPENAI_MODEL_PRIMARY` for A1, A2, A4; `OPENAI_MODEL_FAST` for A3, A5; `OPENAI_REASONING_EFFORT`) and `AI_FALLBACK_PROVIDER=meta` (`META_BASE_URL`, `META_MODEL_*`). Fallback fires after retries on 429/5xx/timeout.
  - [ ] Log every call to `ai_calls` (provider, model, tokens, estimated cost, fell_back); `pnpm ai:cost` prints spend so far.
  - [ ] Smoke script `pnpm ai:smoke`: `GET /v1/models` + one `Output.object()` call per provider, so bad keys or renamed models fail before the demo.
  - [ ] Stable system prompt + pack ontology prefix so OpenAI's automatic prompt caching applies; 12 s timeout; 2 retries with jitter; a circuit breaker; a global `AI_ENABLED` flag plus a per-session "AI off" toggle.
- [ ] **T9.2 A1: brief → requirements** — depends on T3.1, T4.7
  - [ ] Output: `RequirementDraft[]` + `Question[]`; fields must exist in the pack ontology (unknown fields are dropped and logged).
  - [ ] **Quote check against the brief**: a `user_stated` item without a matching span is downgraded to `ai_inferred`.
  - [ ] Stream partial output to the UI.
  - ✅ The home-office brief produces the requirement set expected by the eval (T9.6).
- [ ] **T9.3 A2: roles and candidate queries**: merge with the pack role template; extra roles are tagged `ai_inferred`
- [ ] **T9.4 A4: refinement commands** → `RequirementPatch[]`, shown as a requirement diff and applied only when the user confirms
- [ ] **T9.5 A5: explanations**: input is report/diff JSON only; numbers are interpolated from the JSON; labeled "AI summary"
- [ ] **T9.6 AI eval set**: 20 briefs (8 home office, 6 apparel, 6 travel) with the expected requirements; `pnpm eval:ai` reports field-level precision and recall. Target ≥ 0.9 on hard requirements. Run on `gpt-6-luna` during development (≈ $0.01 per full pass); run once on `gpt-6-sol` and once on `muse-spark-1.3` before G4 to confirm both demo and fallback models pass.
- [ ] **T9.7 Injection tests**: listing text with instructions produces no behavior change; the extraction output schema is still valid

---

## Phase 10: Web shell and paper design system (F + D)

- [ ] **T10.1 Design tokens** (D) — from the T0.5 mockups
  - [ ] The paper and blueprint palettes from SDD §17.7 as CSS variables and Tailwind theme tokens; `pass`, `fail`, `unknown`, `estimate`, `info`, each paired with an icon and text label.
  - [ ] Type scale (Source Serif 4 headings, Geist Sans UI, Geist Mono numbers), spacing, radii, stacked-sheet shadows, focus ring (visible on paper and blueprint).
  - ✅ Every text/background pairing checked for ≥ 4.5:1 (≥ 3:1 for large text); `--pencil` never carries meaning alone.
- [ ] **T10.2 Paper materials** (D)
  - [ ] Paper background: inline SVG `feTurbulence` noise at 3–4% + 24 px dot grid; blueprint variant for dark mode.
  - [ ] Crisp 1 px borders, 8 px card radius; no tilt, tape or sketchy borders.
  - [ ] `Mark` helper (rough-notation) for exactly three uses: red-pen `circle`, `highlight`, `bracket`.
  - [ ] lucide status icons (check, x, help-circle, tilde, alert-triangle); `Stamp` component ("SIGNED v7", "PAID", "BLOCKED").
- [ ] **T10.3 Components** (F; Storybook optional, otherwise a `/dev/components` route)
  - [ ] `RequirementChip` (provenance marker: You said / You chose / I assumed / Default), `EvidenceBadge`, `ProofRow`, `ProofSummary`, `PlanCard`.
  - [ ] `ProductCard`, `SpecReceiptRow`, `FacetChip` (with Add as rule), `CheckoutTierBadge`, `SourcePill`.
  - [ ] `LayersTable`, `ContractDiff` (git-diff style, Geist Mono), `HashPill` (abbreviated, copy button).
  - [ ] `LedgerTimeline`, `MerchantStatusTable`, `GuardStepper`, `CommandBar` (⌘K), `PlanTray`, `CompareTray`.
  - ✅ Each component is keyboard accessible and has an axe-clean example in both themes.
- [ ] **T10.4 Layouts**: the three-pane workspace (resizable); Explore grid; on mobile, tabs for Plan · Requirements · Proof with a sticky summary bar, and a two-column Explore grid with a bottom-sheet filter panel
- [ ] **T10.5 Auth UX**: an anonymous session on the first visit; an "upgrade to save & pay" dialog (email OTP / Google) that links the identity so plans are kept
- [ ] **T10.6 Landing page** `/`: headline, subhead, the cast introduced (one line each), scroll-linked paper sheets (T10B.6), an animated mini Consent Diff, "Start a plan" → `/new`, "Explore" → `/explore`, a "How it works" strip, and a link to `/trust`
- [ ] **T10.7 `/trust` page**: the trust domains drawn as the cast, what the AI does and doesn't do, the evidence labels (pencil → ink → stamp), the standards used (ACP, UCP, RFC 9421/TAP, AP2 export, WebAuthn), the checkout tiers, and the honesty notes (test merchant, sandbox)

---

## Phase 10B: The cast and micro-interactions (D)

Everything lives in `apps/web/components/doodle/`. Nothing here may block the spine.

- [ ] **T10B.1 Figure engine**: an SVG skeleton (head, torso, upper and lower arms and legs) driven by joint-angle pose data; Motion interpolates between poses; clean even strokes (no line boil); props attach to the hand joint
  - ✅ A `/dev/figures` page shows every pose in both themes.
- [ ] **T10B.2 Poses**: `idle`, `run[4]`, `stamp[3]`, `block`, `pull[3]`, `sit`, `highfive`, `tangled`, `map`, `thumbsup`
- [ ] **T10B.3 Props**: magnifier, clipboard, stamp, stop sign, rope, basket, map, price tag, satchel, binoculars, cap, bow tie
- [ ] **T10B.4 The cast**: `Scout`, `Inspector`, `Notary`, `Guard`, `Gremlin` per SDD §17.8 (one accent color each; 48–96 px in the app)
- [ ] **T10B.5 Event hooks**: `useSearchStatus` (per-source state), `useProofStream` (proof_results broadcast), `useSignatureEvent`, `useDiffEvent`, `usePaymentEvent`, `useBenchProgress`. Figures animate only from these hooks, never from timers.
- [ ] **T10B.6 Placements** (each with its reduced-motion version and text equivalent, SDD §17.9):
  - [ ] Landing: the Scout on a rope pulls the next paper sheet down (Motion `useScroll`; no scroll hijacking).
  - [ ] Search loading: the Scout runs between source icons; ✓ + count per source.
  - [ ] Proof streaming: the Inspector stamps rows as they arrive.
  - [ ] Signing: the Notary stamps "SIGNED v{n}".
  - [ ] Auto-accepted change: the Inspector's thumbs-up in the ledger.
  - [ ] Purchase paused: the Guard steps in front of Pay; red-pen circle on the failing value.
  - [ ] Paid: the receipt prints down; high-five.
  - [ ] Bench: Gremlin vs. Guard with the counter.
  - [ ] Empty plan (Scout on basket), 404 (map upside down), error (tangled in cable).
  - [ ] Mobile pull-to-refresh on the plan page (stretch).
- [ ] **T10B.7 Accessibility and performance check**
  - ✅ All figures `aria-hidden`; every state has its text equivalent in an `aria-live` region.
  - ✅ `prefers-reduced-motion`: still poses, no scroll-linked motion.
  - ✅ Doodle bundle ≤ 30 kB gzipped on first load; figures below the fold lazy-load; `transform`/`opacity` only; < 4 ms per frame in the Performance panel.
  - ✅ No action waits on an animation (≤ 600 ms feedback).

---

## Phase 11: ProofCart screens (F, wired with E/M/P)

Build every screen against **mock data from the Zod fixtures first**, then switch to real data once the lanes land.

- [ ] **T11.1 `/new`**: brief textarea; scenario template buttons; pack auto-detection shown as a chip; submit → `createPlan`
- [ ] **T11.2 Requirements review** `/plans/[id]/requirements`
  - [ ] Three groups: **You said** (the quote shown on hover), **I assumed, confirm?**, **Needs your answer** (question cards).
  - [ ] Edit value and unit, toggle hard/preference, delete, add. **Manual builder form** (the "AI off" path).
  - ✅ With the AI off, the user can build the flagship requirement set entirely by form.
- [ ] **T11.3 Workspace** `/plans/[id]`
  - [ ] Left: requirements (compact). Center: the plan (items, delivered total, plan switcher A/B/C). Right: the Proof panel, **streaming rows via Realtime**.
  - [ ] Command bar: a refinement → `RequirementPatch` preview → confirm → re-solve → changed items highlighted.
- [ ] **T11.4 Evidence drawer** (intercepting route): the source snapshot in a sandboxed iframe or rendered JSON, with the quote highlighted; provenance (source type, URL, retrieved-at, extractor); freshness; conflicts side by side; an **"Untrusted text"** badge for listing prose
- [ ] **T11.5 Compare** `/plans/[id]/compare`: a requirement-first table (rows = requirements, columns = plans); tradeoff line per plan; the **minimal conflict banner** with one-click relax actions
- [ ] **T11.6 Contract** `/plans/[id]/contract`
  - [ ] Exact SKUs, merchant, seller, economics with max total, the autonomy preset selector (with the table from SDD §7.6 shown), waivers (the user must tick each `unknown` hard requirement), the mandate builder (trigger + not-after), `HashPill`.
  - [ ] **Sign with passkey** (T12).
  - ✅ The Sign button stays disabled until every hard requirement is `pass` or waived.
- [ ] **T11.7 Checkout guard** `/plans/[id]/checkout`: a `GuardStepper` (Refresh cart → Re-fetch specs → Re-prove → Diff → Guard → Pay → Order), each step streaming with timing
- [ ] **T11.8 Purchase paused** `/plans/[id]/diff/[diffId]`
  - [ ] Headline "PURCHASE PAUSED · NO PAYMENT WAS MADE".
  - [ ] **LayersTable** (cart hash / merchant / amount / ProofCart).
  - [ ] An approved-vs-current table; a plain-language explanation (template, with an optional A5 rewording).
  - [ ] **Compliant alternatives** (solver with the failing item's role re-opened).
  - [ ] The `ContractDiff` for v{n} → v{n+1}, then re-sign.
  - [ ] An `aria-live="assertive"` announcement.
- [ ] **T11.9 Orders** `/orders`, `/orders/[id]`: purchase record, rail and transaction ID, contract hash, proof at purchase, return-policy snapshot, order timeline, **Download Evidence Pack**, **Scan delivery**
- [ ] **T11.10 Ledger** `/ledger/[planId]`: a timeline of events with actor icons; a **Verify chain** button → ✓ or the broken seq
- [ ] **T11.11 Mandates** `/mandates`: active, fired, blocked and expired; next check; cancel
- [ ] **T11.12 Bench** `/bench`: the latest CI run, per-category pass rates, a scenario list with expected vs actual, **Run live**
- [ ] **T11.13 Settings**: `/settings/payment` (Microform card entry; shows brand, last 4 and expiry) and `/settings/signing` (register or remove the signing passkey)
- [ ] **T11.14 States pass**: every screen has loading, empty, error and degraded states per SDD §17.4; no bare spinners
- [ ] **T11.15 `/explore`**: categories, kits shelf, "Passes popular kits" shelves, recently viewed; works signed out
- [ ] **T11.16 `/search`**: search bar; per-source status strip (streaming NDJSON); result grid of `ProductCard`s; facet panel (bottom sheet on mobile) with **Add as rule** on each facet; empty and timeout states
- [ ] **T11.17 Product page** `/p/[productId]`
  - [ ] Gallery; offers table (one row per source/merchant with price, availability, delivery, tier badge).
  - [ ] **Specs with receipts**: `SpecReceiptRow`s grouped by category; conflicts shown side by side under **Sources disagree**; click → evidence drawer.
  - [ ] **Checks against your plan** (when a plan is active); **Add to plan** (role picker); **Add as rule** on spec rows.
  - ✅ The Halden M27Q-USBC page shows "USB-C power · 65 W · Manufacturer says" and passes the flagship plan's monitor rules.
- [ ] **T11.18 Kits** `/kits/[slug]`: rules and starter basket; **Make it mine** → `forkKit`
- [ ] **T11.19 Trays**: global `PlanTray` (bottom sheet: items, live pass/fail summary, "Review contract") and `CompareTray` (up to 4 products → rule-by-rule compare)
- [ ] **T11.20 Checkout tier UX**: `CheckoutTierBadge` everywhere an offer appears, with a tooltip explaining Full / Hand off / Proof only; plan-level summary when items span tiers

---

## Phase 12: Signing (P, F for the client)

- [ ] **T12.1 Signing-key registration**: `generateRegistrationOptions` (`userVerification: 'required'`, residentKey preferred) → `verifyRegistrationResponse` → `signing_credentials`
- [ ] **T12.2 Signing options**: load the version → `contractHash` → insert `signing_challenges` (nonce, 2 min TTL) → options with the custom challenge `pc1:{H}:{N}`
- [ ] **T12.3 Signing verify**: `verifyAuthenticationResponse` (expected challenge via `isoBase64URL.fromUTF8String(...)`, origin, RP ID, credential, counter); in one transaction: insert the signature, delete the challenge, transition to `signed`, append to the ledger
- [ ] **T12.4 Client ceremony**: `@simplewebauthn/browser` `startAuthentication`; handle `NotAllowedError` (cancelled) and unsupported devices (offer phone hybrid)
- [ ] **T12.5 Security tests**
  - ✅ A tampered body → the hash mismatches → verification fails.
  - ✅ A reused challenge → fails.
  - ✅ A wrong origin → fails.
  - ✅ An expired challenge → fails.
  - ✅ Another user's credential → fails.

---

## Phase 13: Checkout and payments (P)

- [x] **T13.1 Visa Acceptance client**
  - [x] REST HTTP-Signature auth (merchant ID, key ID, shared secret) against `apitest.cybersource.com`, using either `cybersource-rest-client` or a thin typed client.
  - ✅ A sandbox smoke test authorizes test card `4111 1111 1111 1111` for $1.00 and logs the transaction ID.
- [ ] **T13.2 Card enrollment**
  - [ ] Capture context for Microform Integration v2 → mount the hosted fields in `/settings/payment` → transient token.
  - [ ] Create a TMS customer and payment instrument from the transient token. **Confirm the exact endpoint and flow in the sandbox docs.** A zero-amount auth with a token-create action is the alternative.
  - [ ] Store only `rail_ref`, brand, last 4 and expiry.
  - ✅ The PAN never reaches our server (check the network tab and logs).
- [ ] **T13.3 Payment rails**: the `PaymentRail` interface (SDD §13.4); `VisaAcceptanceRail`, `SimulatedRail` (always shows a banner), `AuthorizeNetRail` (Accept.js fallback), and a `VicRail` stub mapped to the VIC flow (completed if credentials arrive)
- [ ] **T13.4 Scoped payment grant**: a JWS (EdDSA) with `merchantOrigin`, `maxTotalMinor`, `currency`, `contractId`, `bodyHash`, `instrumentRef`, `exp` (10 min), `jti`; mint in ProofCart, verify in DemoMart
- [ ] **T13.5 Execute route** `POST /api/checkout/[versionId]/execute` (requires `Idempotency-Key`)
  - [ ] ACP GET → re-fetch specs → `evaluate` → `consentDiff` → insert snapshot and diff → if `reapprove`/`block`, transition to `invalidated` + ledger + return 409 with the diff ID.
  - [ ] Otherwise `begin_execution` → mint grant → ACP `complete` (tag `agent-payer-auth`) → `complete_execution` → ledger → broadcast.
  - ✅ The flagship happy path produces a real sandbox authorization; the flagship trap returns 409 with `classification: block`.
- [ ] **T13.6 Webhook receiver** `/api/webhooks/demomart`: verify HMAC and timestamp (5 min tolerance); dedupe on `(provider, event_id)`; update the order; ledger
- [ ] **T13.7 Declines and retries**: map sandbox declines to a clear UI state; a retry needs a user click and a **new** idempotency key; never retry automatically after a timeout. Reconcile first with ACP GET.
- [ ] **T13.8 Multi-merchant status**: a plan-level `MerchantStatusTable` for plans spanning merchants (paid / failed / not attempted) with honest copy; no auto-rollback claims
- [ ] **T13.9 VIC** *(only if Visa provides credentials)*: `@visa/token-manager` / `@visa/api-client`; enroll the card → agent token → Visa Payment Passkey → Payment Instruction (merchant + amount from the contract, referencing `contractId` and `bodyHash`) → credential retrieval → DemoMart charge → outcome signal; switch with `PAYMENT_RAIL=vic`
- [ ] **T13.10 Shopify hand-off tier** `POST /api/handoff/[versionId]` — depends on T7.5
  - [ ] Build the cart and checkout through UCP (`cart_mcp`, `checkout_mcp`); re-prove the checkout state against the signed contract; on `identical`/`auto`, record `checkout.handed_off` in the ledger and return the store's checkout URL; on `reapprove`/`block`, show the paused screen as usual.
  - [ ] UI copy after hand-off: "Re-checked at {time}. After this, the store's checkout decides."
  - ✅ A Shopify item in a plan hands off with a ledger entry; no ProofCart payment is attempted.

---

## Phase 14: Standing mandates (P)

- [ ] **T14.1 Arm and cancel**: `armMandate` (status `signed → armed`), `cancelMandate`; the mandate is part of the signed body
- [ ] **T14.2 Cron → queue → worker**: `mandates-tick` enqueues due mandates into `q_mandate_eval` and `pg_net` POSTs to `/api/internal/queue/mandate_eval` with the Vault HMAC
- [ ] **T14.3 Worker**: HMAC check; `pgmq.read` with a 60 s visibility timeout; process; archive on success; after 5 attempts move to the DLQ; structured logs
- [ ] **T14.4 Trigger evaluation**: refresh the offer → `price_lte` / `back_in_stock` → if it fired, reuse the T13.5 path (same code, actor `system:mandate`)
- [ ] **T14.5 Notifications**: an in-app Realtime toast plus an entry on `/mandates`; optional email
- [ ] **T14.6 Demo hook**: the Chaos Panel's "Run tick now" calls the worker directly (admin token)
  - ✅ The flagship: arm the mandate, run the deal-trap scenario, the tick fires, the purchase is blocked, and the paused screen appears within 2 s.

---

## Phase 15: Post-purchase (M, F for the UI)

- [ ] **T15.1 Evidence Pack generator** (a `q_evidence_pack` consumer or on demand)
  - [ ] A zip (`fflate`) with `contract.json` (JCS), `contract.sha256`, `signature.json` (assertion + public key JWK), `proof-report.json`, `ap2-mandates.json`, `sources/*` with hashes, `ledger-excerpt.json`, `payment.json`, `summary.pdf` (`@react-pdf/renderer`), `verify.mjs`, and a `README.txt`.
  - [ ] Stored in `evidence-packs/`; `evidence_packs` row with its sha256.
- [ ] **T15.2 `verify.mjs`**: bundled with esbuild into one file with no network use; recomputes the JCS hash, verifies the WebAuthn signature over `authenticatorData ‖ SHA-256(clientDataJSON)` and checks that the challenge contains the hash, and verifies the ledger excerpt chain
  - ✅ `node verify.mjs` prints ✓ for each check; tampering with `contract.json` → ✗ hash.
- [ ] **T15.3 Delivery match**: on `/orders/[id]`, scan (`BarcodeDetector` with a `@zxing/browser` fallback) or type a GTIN → compare with the contract items → ledger `delivery.matched` / `delivery.mismatched`
- [ ] **T15.4 Dispute packet view**: on a mismatch, a structured "approved vs facts at purchase vs received" summary, exportable as PDF

---

## Phase 16: ProofBench and test suites (E lead, everyone contributes scenarios)

- [ ] **T16.1 Scenario format and runner**: YAML/JSON under `packages/bench/scenarios/**`; the runner uses the pure engine (plus the DB guard for execution scenarios); JUnit and JSON output
- [ ] **T16.2 Author ≥ 62 scenarios** per SDD §22.2 (identity 8, same-SKU facts 8, economics 8, terms 6, delivery 4, availability 3, recurring 3, evidence 8, derived 4, security 5, benign 5)
- [ ] **T16.3 CI integration**: the bench runs on every PR; results upsert into `bench_runs` from `main`; `/bench` reads them
- [ ] **T16.4 Guard integration suite**: one test per rejection code + idempotency + token reuse (extends T2.7)
- [ ] **T16.5 Retry fuzz**: 200 randomized execute calls with duplicated idempotency keys, timeouts and webhook replays → exactly one execution and one order per key
- [ ] **T16.6 E2E** (Playwright, run locally or in CI)
  - [ ] Happy path: brief (AI off, form) → sign (virtual authenticator) → pay (Simulated rail in CI) → order.
  - [ ] Trap path: sign → mutate → execute → paused → re-sign → pay.
  - [ ] Keyboard-only run of the trap path.
  - [ ] `@axe-core/playwright`: 0 critical or serious violations on every route.
- [ ] **T16.7 Release gates** (SDD §22.2) are recorded on `/bench`

---

## Phase 17: Hardening and polish (everyone, H+24 → H+30)

- [ ] **T17.1 Security headers**: CSP (allow Microform, Supabase and Sentry only where needed; AI calls are server-side and need no CSP entry), `frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy` (camera only on `/orders/*`)
- [ ] **T17.2 Rate limits**: a Postgres token bucket on AI endpoints and `/api/bench/run`
- [ ] **T17.3 Log redaction review**: grep the logs for `4111`, `authorization`, `secret`, `signature` → none present
- [ ] **T17.4 RLS audit**: the Supabase advisor (security + performance) is clean; every table has RLS
- [ ] **T17.5 Accessibility pass**: keyboard through the full flow; a VoiceOver pass on the contract and paused screens; contrast check in both themes; reduced motion
- [ ] **T17.6 Performance pass**: measure against SDD §23; fix the worst two
- [ ] **T17.7 Copy pass**: search the UI for "guarantee", "safe", "authentic", "will fit" and bare "verified"; fix them per SDD §17.3
- [ ] **T17.8 Mobile pass**: 375 px width, the whole flow, no horizontal scroll, sticky summary
- [ ] **T17.9 Empty and error states pass**: trigger each state in SDD §17.4 at least once
- [ ] **T17.10 "Does it look trustworthy?" check**: show the contract, paused and paid screens to someone outside the team for 30 seconds; if any of them reads as childish, remove figures from that screen and keep only stamps and red pen
- [ ] **T17.11 Source terms check**: attribution and link-backs on every UPCitemdb and Shopify offer; `SOURCES_ENABLED` kill switch tested; no scraping anywhere
- [ ] **G4 feature freeze** (H+28): after this, only bug fixes and demo work

---

## Phase 18: Demo and submission (M lead, everyone)

- [ ] **T18.1 Reset script** `pnpm demo:reset`: resets the DemoMart seed, clears the demo user's plans, keeps the enrolled card and signing passkey, warms the prompt cache, pre-runs the bench, and pre-warms the search cache for "navy linen shirt"
- [ ] **T18.2 Demo environment check** (run 30 min before judging)
  - [ ] Production URLs load; `/api/health` is green in both apps; the JWKS is reachable from DemoMart.
  - [ ] Touch ID works on the demo laptop on the **production** domain; the phone backup is signed in.
  - [ ] Visa Acceptance sandbox smoke test passes; `PAYMENT_RAIL` is correct.
  - [ ] Chaos Panel is open in its own window, **Reset** has run, the Agent Log is visible.
  - [ ] Latest bench is green; ledger verification passes.
  - [ ] Explore: "navy linen shirt" returns results from each enabled source (or from the warm cache).
  - [ ] Reduced motion is **off** on the demo laptop (so the cast animates) and the volume/notifications are muted.
  - [ ] Wi-Fi fallback: phone hotspot ready.
- [ ] **T18.3 Rehearse the 3:00 script** (SDD §25.2) three times with a timer; assign the speaker and the driver; decide in advance what to skip if you run over time (the breadth flash)
- [ ] **T18.4 Backup video**: record the full flow in one take (1080p, with captions) and upload it unlisted
- [ ] **T18.5 Devpost**
  - [ ] Inspiration, what it does, how we built it (the architecture diagram from SDD §6.1), challenges, accomplishments, what we learned, what's next.
  - [ ] Screenshots: the landing page with the cast, Explore search, a product page with specs and receipts, the workspace, the paused screen with the Guard and the layers table, the contract with its stamp and hash, `/bench`, the Agent Log.
  - [ ] **Honesty notes**: DemoMart is a test merchant; the payment is a Visa Acceptance sandbox; the scoped grant emulates agent-token controls; VIC status.
  - [ ] Links: the live app, the repo, the video.
- [ ] **T18.6 README.md**: a one-paragraph pitch, the architecture, local setup (`pnpm i`, `supabase start`, `pnpm dev`), env vars, scripts, the test and bench commands
- [ ] **T18.7 Judge Q&A drill**: each person answers two questions from SDD §25.3 out loud
- [ ] **T18.8 Submit** by H+35

---

## Cut lines (decide at each gate, not in a panic)

**Never cut.** This is the demo's integrity:

1. The Proof Engine + `home-office` pack + the same-SKU Consent Diff.
2. The DemoMart Chaos Panel (visible).
3. Passkey signing over the contract hash.
4. The DB payment guard.
5. A real Visa Acceptance sandbox authorization, or Authorize.net if the Visa Acceptance sandbox is blocked.
6. At least 30 ProofBench scenarios shown on `/bench`.

**Cut in this order if you are behind:**

1. The eBay and Open Food Facts adapters; stretch packs (grocery, health, household).
2. Figure extras: pull-to-refresh, 404 and error art, Gremlin on `/bench` (keep the counter).
3. The landing-page rope (keep the stacked paper sheets without the Scout).
4. Kits pages (keep "Make it mine" from the landing page only) and the Compare tray.
5. The Shopify hand-off tier (keep Shopify products as proof-only).
6. Live Shopify search (fall back to the warm cache + UPCitemdb + DemoMart).
7. Delivery-match scanning (keep the typed-GTIN version).
8. Email notifications for mandates (keep the in-app toast).
9. The AP2 export UI (keep the endpoint and the file in the Evidence Pack).
10. PDF in the Evidence Pack (keep the JSON + `verify.mjs`).
11. Top-3 diversity (keep one optimal plan + the minimal conflict set).
12. The mandate cron/queue (keep "Run tick now" calling the same execute path).
13. The TAP verification UI polish (keep the verification itself + the log table).
14. Realtime streaming (fall back to 1 s polling).

**Keep as long as possible from the design lane:** the paper theme, the Guard on the paused screen, the Notary's stamp and the Scout on search loading. Those four moments carry the identity.

---

## Definition of done: release checklist

Correctness

- [ ] Every hard requirement resolves to pass, fail or unknown; `unknown` never passes (property test green).
- [ ] 100% of facts used by hard rules have `source_id` and `retrieved_at` (a DB check query returns 0 rows).
- [ ] ProofBench: 100% of material mutations are caught and 0 benign scenarios are blocked.
- [ ] 0 executions against unsigned, expired, superseded or materially changed contracts (guard suite green).
- [ ] 0 duplicate executions or orders under the retry fuzz.
- [ ] The ledger verifies for every plan.

Security

- [ ] RLS on every table; the Supabase advisors are clean.
- [ ] The secret key is used server-side only (`server-only` imports); the client uses the publishable key.
- [ ] No PAN anywhere in the DB or logs; card entry through Microform only.
- [ ] Webhooks are HMAC-verified and deduplicated; agent requests are RFC 9421-verified.
- [ ] CSP and security headers are live.
- [ ] Untrusted listing text cannot change behavior (injection scenarios green).

Experience

- [ ] The full flow works by keyboard alone; axe shows 0 critical or serious violations.
- [ ] Status is never conveyed by color alone.
- [ ] Mobile at 375 px works end to end.
- [ ] Every screen has loading, empty, error and degraded states.
- [ ] The evidence copy rules pass (no "guaranteed", "safe", "authentic", "will fit", or bare "verified").
- [ ] The "AI off" path completes the full flow.
- [ ] Every figure animation is triggered by a real event, has a text equivalent, and has a reduced-motion version.
- [ ] Doodle bundle ≤ 30 kB gzipped; no animation delays an action.
- [ ] Explore works signed out; every offer shows its source and checkout tier.

Demo

- [ ] Three timed rehearsals are under 3:00.
- [ ] The backup video is uploaded.
- [ ] Devpost is submitted with honesty notes.
- [ ] The reset script and the environment checklist have been run.
