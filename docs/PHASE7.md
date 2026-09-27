# Phase 7 implementation and verification

Implemented September 26, 2026 against SDD §7.3, §10.2, §11 and §19, and the Phase 7 checklist in TASKS.md.

## Delivered

`packages/evidence` holds snapshots, the source adapters and the fact store. The IO it needs (fetch, Storage, Postgres) is injected, so every adapter is unit-tested against captured real responses. The Supabase wiring is a separate entry point, `@cartel/evidence/supabase`.

| Task | Module | What it does |
|---|---|---|
| T7.1 | `snapshot.ts`, `http.ts` | Every fetch stores its raw bytes at `sources/{sha256}.{ext}` and writes a `sources` row, including failed responses. Objects are content-addressed. `cachedFetch` serves a recent successful snapshot of the same URL (or cache key) instead of calling the source again; this is the "cache every response in Supabase" requirement. Each request has a deadline and a 10 MB cap, and errors come back as a typed `SourceError` (`timeout`, `rate_limited`, `http`, …). |
| T7.2 | `jsonld.ts` | Parses `<script type="application/ld+json">`, including arrays, `@graph` and broken blocks. Values are read through the pack's `jsonLd` paths and the proof engine's parser. Merchant claims are `source_stated`. Only packs covering the product's roles are used, and role-named fields for other roles are dropped, so a monitor's "Resolution" never becomes `webcam.resolution`. Unreadable text is kept as a `no_fact` claim with its raw text. |
| T7.3 | `adapters/greathub.ts`, `checkout.ts` | All requests are RFC 9421-signed with the agent key. `refreshSpecs` reads `/p/{slug}` JSON-LD. `getCheckout` reads an ACP session. `refreshOffer` prices an item through a throwaway session and then cancels it. The ACP bytes are recorded exactly as received and snapshotted before parsing. Checkout facts are `verified`; delivery is capped at `estimated`. |
| T7.4 | `adapters/cpsc.ts` | Queries by brand, then matches on our side: the brand must appear as a whole word, and the model number (separator-tolerant) or the UPC must appear too. The live API's substring match returns "Trankerloop" for "anker". A brand-only hit leaves the fact `unknown` (`insufficient_evidence`). The label is "No recall found in CPSC as of {t}", never "safe". `baseUrl` and `label` point it at GreatHub's `/api/mock-cpsc` in demo mode. |
| T7.5 | `adapters/shopify.ts`, `/.well-known/ucp` | JSON-RPC `tools/call` client for `search_catalog`, `get_product` and `lookup_catalog`, with 429/503 backoff and jitter. Each variant becomes a live offer, fresh for 10 minutes. The UPID (GID) is kept, and a GTIN is taken from variant barcodes. Garment facts come only from structured data: variant options (color, size) and fiber composition from merchant metadata. Nothing is read from the description. `ucpAgentProfile()` is served by `apps/web` at `/.well-known/ucp`. |
| T7.6 | `quote.ts` | `verifyCandidates` implements §10.2. Normalization is whitespace plus per-character NFKC only (no case folding), with an offset map, so a span highlights the original snapshot. A measured value must be the only reading the parser finds in the quote. The longest reading is kept, so "up to" survives. Accepted facts are capped at `source_stated`. `FactExtractor` is the plug-in point for `@cartel/ai` (T9.1). |
| T7.7 | `fact-store.ts`, `0014_evidence.sql` | `planFactWrites` is pure: a new reading supersedes the same extractor's current reading, an identical reading is a no-op, and fresh readings that disagree are all flagged `conflict`. A flag is never cleared on an existing row. `public.srv_write_facts` applies a plan atomically, with an advisory lock per subject. It rejects a plan whose expected current facts changed (`stale_fact_plan`, SQLSTATE 40001), and `writeFacts` then re-plans. Authority precedence stays in the engine's `resolveFacts`; `SOURCE_AUTHORITY` maps source types to pack authorities. |
| T7.8 | `refresh.ts`, `/api/internal/queue/fact_refresh` | `verifyQueueWake` checks the cron HMAC exactly as `internal.wake_worker` builds it. `drainQueue` archives handled and skipped messages, leaves failures to reappear after their visibility timeout, and moves a message to `q_fact_refresh_dlq` after 5 reads. The route drains for up to 20 s. Only GreatHub offers are refreshed; reference and hand-off offers are skipped. |
| T7.9 | `adapters/upcitemdb.ts` | Trial tier, or `/prod/v1` with `user_key`. Reads `X-RateLimit-*`, stops at 5 remaining until the reset time, and turns a 429 into `rate_limited`. GTINs are normalized to GTIN-14. Retailer listings become `reference_only` offers whose `fresh_until` equals `retrieved_at` ("last seen"), so they never feed a rule. The listing ID is GTIN + domain + title hash, because the link carries a per-request sequence number. Default cache is 24 h. |
| T7.10 | `adapters/icecat.ts`, `ingest.ts` | Looks up the 13-digit GTIN form. The token is sent as an `api-token` header and never recorded in the snapshot key. Features are mapped by Icecat feature ID, with a name pattern as fallback: diagonal `944`, resolution `1585`, USB PD `38616`, video from HDMI `5620` / DP `6611` / mini-DP `7274` / DP Alt Mode. Values are `verified` where the pack names the manufacturer. `enrichWithIcecat` adds the Icecat external ref and writes the facts; a disagreeing seller page becomes a conflict. |
| — | `ingest.ts` | `ingestProduct` resolves identity in the order: same source record, GTIN, UPID, then brand + MPN. A GTIN race merges into the winner. It fills only missing product columns, upserts external refs and offers, and writes facts. The catalog package (T7B) can build on this. |

Other pieces:
- `inferRoles` guesses roles from category before title. The live Icecat title "USB-C **Hub** Monitor" had been read as a dock.
- `enabledSources` is the `SOURCES_ENABLED` switch.
- `apps/web/lib/evidence.ts` wires the store and the signed GreatHub adapter.

## Verified

- `pnpm --filter @cartel/evidence test`: 84 tests. The fixtures are live responses captured on 2026-09-26: a UPCitemdb search, Icecat sheets for the Dell U2723QE and ViewSonic VP2785-4K, and a CPSC search for "anker". Checks include:
  - GreatHub requests verified by `@cartel/tap`'s `verifyRequest` in the mock server
  - the rejection cases for invented, misread and ambiguous quotes
  - race and retry handling in the fact writer
  - the UPCitemdb quota stop
  - the HMAC wake check
  - DLQ behavior
- `EVIDENCE_LIVE=1 … vitest run src/live.test.ts`: 3 tests against the real services, all passing:
  - UPCitemdb returns monitors with GTIN, brand and model
  - Icecat returns 90 W `verified` for the U2723QE, and no sheet for a fictional GTIN
  - CPSC matches Anker A1647 and returns no recall for Vireo
- `supabase test db`: `evidence.test.sql` adds 13 assertions (144 total, all passing): write, conflict flags, span and JSON storage, stale-plan rejection, superseding while keeping history, whole-call atomicity, and clients denied.
- `supabase db lint --fail-on warning`: clean.
- `pnpm db:test:integration`: `evidence.db.test.ts` runs through PostgREST and Storage (23 tests in the suite, all passing):
  - a real UPCitemdb listing is ingested (reference offers, snapshot bytes readable back, cache lookup) and re-ingested without duplicates
  - Icecat enrichment writes `verified` PD 90 W with an `icecat` source
  - a 65 W seller page flags both readings (**Sources disagree**)
  - a queued `{offerId}` is drained and re-priced from a GreatHub checkout (`offer.price` `verified`, `acp_checkout` source); the seeded row is restored afterwards
- `apps/web` typechecks. `GET /.well-known/ucp` serves the profile with the agent's public key (checked with curl on the running dev server). The queue route answers 503 while `INTERNAL_QUEUE_HMAC_SECRET` is a placeholder.

## Not done / open

- **T7.5 live check.** Shopify fetches the agent profile on every call and rejects anything it can't reach (`profile_unreachable`) or whose version isn't `2026-08-25` (`version_unsupported`); both were observed. The adapter follows the UCP 2026-08-25 schemas, but the "navy linen shirt ≥ 10 products" acceptance needs `SHOPIFY_AGENT_PROFILE_URL` pointing at a deployed Cartel. T0.6 go/no-go is still open.
- **GreatHub end to end.** The adapter codes against the Phase 6 contract (`/p/{slug}`, ACP item ID = SKU per `0101_greathub_ops.sql`). Tests use a mock that verifies signatures. Re-run against the real storefront when T6.1 and T6.3 land.
- **Queue worker secret.** `INTERNAL_QUEUE_HMAC_SECRET` must be set (and equal to Vault `worker_hmac_secret`) before the route does anything.
- **Seed mismatch (fixed).** Seed products used the role `toiletry_bottle` while the travel pack's role is `toiletry`; the seed now uses pack roles, and `packages/rule-packs/src/seed.test.ts` checks every seed role and kit rule against the packs.
- **Skipped.** T7.11 Open Food Facts (stretch; no grocery pack) and T7.12 eBay (no partner access).
