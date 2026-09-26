# Phase 6 implementation and verification

Implemented September 26, 2026 against SDD §13.1–§13.4, §16, §18.2 and the Phase 6 checklist.

## Delivered

### GreatHub (`apps/greathub`)

| Route | Task | Notes |
|---|---|---|
| `/`, `/p/[slug]?sku=` | T6.1 | Catalog from `greathub.*`, department filter, variant options, visible spec table, schema.org `Product` + `Offer` + `additionalProperty` JSON-LD (shipping details, return policy, subscription price), recall and "ships as" notices, seller note |
| `GET /api/products/[id]` | T6.2 | TAP-signed read; SKU or slug; visible spec + live offer |
| `/acp/checkout_sessions…` | T6.3, T6.4 | Create, update, get, complete, cancel. `API-Version: 2025-09-12` required, `Request-Id` echoed, `Idempotency-Key` required on create and complete. Totals computed server-side; `line_items[].item.x_cartel` carries seller, GTIN, shipped GTIN, final sale, return terms, pack size, subscription, availability, delivery window, spec URL and offer revision |
| (all agent routes) | T6.5 | RFC 9421 verification: ≤ 8 min window, `created` past, `expires` future, single-use nonce (`greathub.record_nonce`), JWKS with 5 min cache, Content-Digest for bodies, `agent-browser-auth` for reads, `agent-payer-auth` for `/complete`; 401 + `Accept-Signature` on failure; every attempt written to `agent_log` |
| `/agents` | T6.6 | Live table, 1 s poll, pauses in background tabs |
| `/complete` | T6.7, T6.8 | See the order of checks below |
| outbox | T6.9 | `order_created` / `order_updated`, `X-Signature: t=…,v1=<HMAC-SHA256(t.body)>`, retries after 1 s, 5 s, 30 s, then parked (requeue from the panel) |
| `/chaos` | T6.10 | All 16 mutations with parameter forms, 5 scenario scripts, two-step Reset, "Run mandate tick now", "Retry webhooks", live mutation log with readable diffs, webhook status |
| `/api/mock-cpsc/RestWebServices/Recall` | T6.11 | saferproducts.gov response shape, `DEMO_MODE` only, labeled "Mock CPSC (demo)" in every record and header |
| `/orders`, `/orders/[id]` | T6.12 | Amount, rail, transaction ID, badges (agent ✓, grant ✓, "Customer-signed contract v{n} · {hash}"), line items, dispute evidence, merchant status changes that emit `order_updated` |
| `/policies` | — | Terms, returns, shipping and privacy linked from ACP `links[]` |

`/chaos` and `/orders` sit behind `CHAOS_ADMIN_TOKEN`: `Authorization: Bearer` for scripts, or an httpOnly SameSite=Strict cookie holding an HMAC of the token (never the token) plus an Origin check for the panel.

**`/complete` order of checks.** Parse the contract (strict `ContractBody`) → claim the session (one live `/complete` per session) → re-price from the live catalog → verify the grant (EdDSA JWS, `typ` pinned, grant-role `kid`, `aud` = GreatHub origin, `merchantId`, currency, amount ≤ `maxTotalMinor`, `contractHash` = JCS hash of the body) → grant ↔ contract ↔ session agree (ID, version, hash, expiry, merchant origin, exact items and quantities, seller, shipped GTIN) → passkey signature over the body hash from Cartel's origin and RP ID with user verification → grant `jti` unused → charge once → `finalize_order` (order, frozen session snapshot, stock, `order_created`) in one transaction. Anything that fails before the charge releases the session unpaid.

### Database (`supabase/migrations/0101_greathub_ops.sql`)

- Mutation columns: `offers.ships_variant_id` (variant swap), `offers.shipping_fee_minor` (surcharge); `quote()` includes surcharges.
- `apply_mutation`, `apply_scenario` (atomic, all steps or none), `reset_catalog` from `catalog_baseline` (captured at the end of `seed.sql`), `sku_state` for before/after logging. A spec edit bumps the offer revision, so the ACP revision/ETag changes.
- `idempotency_keys` + `idem_begin/finish/abort` (replay, conflict, in-progress; 5xx not stored), hourly GC cron.
- `claim_session` / `release_session`, `finalize_order`, `update_order_status` (transition table), `claim_webhooks` (60 s lease, `skip locked`), `webhook_result` (backoff), `requeue_failed_webhooks`, `record_nonce`, `mock_recalls`.
- `seed.sql`: offers carry the listed pack size; `capture_baseline()` runs last.

### Supporting packages (pieces other phases own)

- `packages/payments`: Visa Acceptance HTTP-Signature client (**T13.1**), scoped grant mint/verify (library half of T13.4), merchant rails (`VisaAcceptanceRail`, labeled `SimulatedRail`).
- `packages/contracts`: `verifyContractSignature` (offline WebAuthn check, ES256/EdDSA/RS256) and a test authenticator in `fixtures`.
- `packages/tap` and `packages/acp` were started here and finished under Phase 8 ([PHASE8.md](PHASE8.md)).

## Verified locally

- **ACP contract suite, 19 tests, against a live GreatHub** (`pnpm test:acp-contract`), on both the simulated rail and `--visa`: unsigned → 401 and logged; replayed nonce, wrong path, wrong tag, grant key used as agent key → 401; signed product facts; API-Version enforcement; flagship prices $896.05 with line taxes summing to the order tax; idempotent replay and 409 on a changed body; update/cancel/Request-Id echo; sessions private to their agent key; deal-trap scenario visible on the ACP GET, the product API and the page JSON-LD in < 1 s, then reset; `/complete` succeeds once, replays, refuses a second key, stays frozen after a later mutation, and delivers an HMAC-verified `order_created`; refusals for a grant below the total (422), a contract edited after signing, a passkey from another origin (403), a cart ≠ contract and a same-SKU variant swap (409), and a browser-tag `/complete`.
- **Visa Acceptance sandbox through GreatHub:** $874.65 AUTHORIZED, transaction `7904210691986945504807`, reference `contractId@8`, merchant-defined data = contract ID, body hash, grant ID; passkey signature recorded as verified. Separate $1.00 smoke test (T13.1) approved.
- pgTAP: 144 assertions in 8 files, including 30 new ones for mutations, scenario atomicity, exact reset, idempotency, nonces and the completion claim.
- Workspace: 652 Vitest tests pass; GreatHub production build succeeds (23 routes).
- HTTP smoke of every page and API route; JSON-LD parses and survives `</script>` in listing text; admin endpoints return 401 without the token.

**Not visually checked.** No browser was used; layout, responsive behavior and contrast are unverified beyond the CSS.

## Decisions and deviations

- **Sessions are priced live until they finish.** Open sessions are re-priced on every read so a mutation is visible immediately; completed and canceled sessions return the snapshot frozen at that moment.
- **Business outcomes are 200, protocol failures are 4xx.** A decline returns the session with a `payment_declined` (or `requires_3ds`) message and status still `ready_for_payment`; grant, contract and signature failures return ACP errors, since nothing was attempted.
- **Merchant-side double checks.** GreatHub also refuses a seller change or a shipped-GTIN change against the contract, even though Cartel's Consent Diff should catch them first.
- **Contract signature is optional, but must verify when present** (SDD §16: "optionally"). Absent is recorded and shown as "Contract signature not provided".
- **Key-role binding by `kid` prefix** (`ct-agent-` / `ct-grant-`, configurable), so an agent key can't mint grants and a grant key can't sign agent requests.
- **Payment provider `cartel`.** `payment_data.token` is the grant JWS; the signed contract and assertion travel in `x_cartel` on the complete request.
- **Instruments.** `tms:<id>` → TMS payment instrument; `sandbox:visa-test-card` → Visa's public test PAN, accepted only when the run environment is the sandbox; `simulated:decline` forces a simulated decline.
- **Mock CPSC path mirrors the real API** (`/RestWebServices/Recall`) so the T7.4 adapter can point at it by base URL.
- **`NEXT_DIST_DIR`** lets the contract harness run a second GreatHub beside a `next dev` in the same folder; the harness restores `tsconfig.json` if Next edits it.

## Fixes to earlier phases

- **Flagship GTINs.** The Phase 3 contract fixture and the Phase 4 rule-pack fixtures used GTINs with wrong GS1 check digits, and the rule-pack U2727 pointed at a Marlow dress's GTIN. They now match the seed (U2727 `00812345000030`, M27Q-USBC `00812345000016`, …); the synthetic U2727E moved to a free valid GTIN (`00812345009002`). The pinned v7 parent hash, the v8 contract hash and the AP2 snapshot were updated; only hashes changed.
- `catalog.test.sql` compared an offer revision to the literal 2, which only held on a fresh database. It now checks "+1 from before".
- `platform.test.sql` lists the new `greathub-idempotency-gc` cron job.

## Open

- Cartel has no `/api/internal/mandates/tick` (T14.6) or `/api/webhooks/greathub` receiver (T13.6) yet. Until then, "Run mandate tick now" reports Cartel's error and order webhooks retry, then park. `lib/webhook-signature.ts` has the reference verifier for T13.6.
- The Gremlin figure in the mutation log waits for T10B.
- `0101` has only been applied to the local database; I did not push it to the cloud project.
- Seven CSS `noDescendingSpecificity` warnings in `globals.css` (warnings, not errors).
