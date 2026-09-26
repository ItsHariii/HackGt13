# Phase 7B — catalog discovery

Implemented in `packages/catalog`, the web API routes, and migration
`0102_catalog_services.sql`. Explore/product UI rendering belongs to Phase 11.

## API

| Request | Result |
| --- | --- |
| `GET /api/search?q=monitor&limit=20&planId=<optional UUID>` | NDJSON, one completed-source line at a time: `{ source, status, products, facets, elapsedMs }` |
| `GET /api/products/<id>?planId=<optional UUID>` | Product, source refs, offers with checkout tiers, evidence/spec rows, and applicable item proofs |
| `GET /api/kits` | Published kits with requirements and starter items |
| `POST /api/kits/<slug>/fork` | Authenticated, same-origin fork; returns `{ planId, setId, basketId }` with HTTP 201 |
| `GET /api/plans/<UUID>` | Owner-only requirements and baskets; every offer includes its checkout tier |

Search accepts 1–200 characters and limits from 1–50. Each source gets a 2.5-second
deadline. Status is `ok`, `cached`, `timeout`, `not_configured`, `rate_limited`, or
`error`. Source failures do not break other lines; disconnecting aborts upstream
requests. Responses use `no-store`. Private plan context requires a verified
Supabase session and an explicit owner match; another user's plan returns 404.

An ID beginning `shopify:` is transient. URL-encode the complete ID when inserting
it into a product-detail path. Detail fetches Shopify again. Persisted products use
UUIDs. Clients can reconcile repeated persisted IDs across source chunks; the
`identityKey` supplies a conservative cross-source hint. Facet counts are per
source result set, not global inventory counts. Recompute combined facets after
deduplicating combined results; do not sum chunk counts blindly.

## Evidence and identity

- Source mappers reuse Phase 7 adapters and the proof engine's deterministic unit
  parser. Known apparel source roles map to pack roles (`shirt → top`,
  `trousers → bottom`, `jacket → outerwear`). Untyped attributes never become facts.
- Persistent identity resolution runs in a short, serialized database transaction:
  existing source reference, then canonical GTIN-14, UPID, and unambiguous exact
  brand + MPN. Contradictory known GTINs cannot merge through weaker identifiers.
  Each persisted source gets a `product_external_refs` row.
- UPCitemdb listings retain their price and retrieval time for display but stay
  `referenceOnly` / `proof_only`. Their offer claims cannot satisfy proof rules.
- Product previews evaluate only item rules for applicable roles. The engine
  applies freshness, authority and conflicts; a preview never claims basket or
  checkout readiness. Rank combines PostgreSQL full-text/trigram relevance with
  passes on hard rules. Variant passes are counted per offer, so incompatible
  variants do not combine their passing rules for a larger boost.
- Facets use pack fields and resolved evidence, including variant fields. Stale
  and conflicting claims do not contribute counts. `promoteToRule(field, op,
  value, 'facet', { role, packs })` creates a hard item requirement with
  `user_selected` provenance; the caller persists it through plan editing.
- GreatHub offers resolve to `full`, Shopify to `handoff`, and other/reference
  offers to `proof_only`. Tiers describe integration capability, not freshness.

## Source configuration and caching

`SOURCES_ENABLED` selects adapters. GreatHub searches the persisted catalog.
UPCitemdb searches or looks up exact GTINs. Icecat searches previously ingested
manufacturer specs; exact-GTIN queries can fetch a sheet when `ICECAT_USERNAME`
is configured. CPSC is a recall checker and is not a search provider. Optional
eBay/Open Food Facts search adapters remain outside this phase.

Successful persisted-source queries cache product IDs in `search_queries` for ten
minutes. Cached responses reload current offers/facts and recompute active-plan
proofs; proofs are never shared between plans. Cache writes are best effort.

**Shopify exception:** [Shopify's catalog usage rules](https://shopify.dev/docs/agents/catalog)
prohibit caching search results. Shopify requests use a transient snapshot store,
zero cache TTL and no database ingestion or image downloads. Source metadata and
facts exist only in the response. Set `SHOPIFY_AGENT_PROFILE_URL` to a publicly
reachable HTTPS `/.well-known/ucp` endpoint. A variant group keeps its UPID rather
than adopting the first variant's GTIN/MPN. Permanent Shopify catalog refs are
intentionally excluded from the general persistence requirement.

## Kit forks

The server validates copied requirements and computes their canonical hash.
`srv_fork_kit` verifies the kit has not changed, then creates the plan, version-1
requirement set, `pack_default` requirements, basket A, and starter quantities in
one transaction. Missing starter offers roll everything back. Each fork creates
a new plan. The RPC is executable only by the service role; the API derives the
owner from the authenticated session. Starting items still need current proof
before checkout.

## Verification

```sh
pnpm --filter @cartel/catalog test
pnpm --filter @cartel/catalog --filter @cartel/db-tests typecheck
pnpm exec supabase db push --local
pnpm db:types
pnpm --filter @cartel/db-tests test:db src/catalog.db.test.ts
pnpm test:catalog
```

`test:catalog` builds with local Supabase public configuration, starts a temporary
production server on an available port, checks search/product/kit/plan routes,
authentication, ownership and origin rejection, and measures 25 GreatHub searches.
It refuses nonlocal Supabase, makes no external catalog requests, and deletes its
test users/plans. A local p95 check is not a claim about deployed or live-provider
latency. The script rebuilds because Next compiles `NEXT_PUBLIC_*` into the bundle.

Unit coverage includes streaming timeout/cancellation, reference-price exclusion,
normalization, variants, facets, staleness/conflicts and ranking. Database coverage
includes concurrent GTIN merging, identity fallbacks, cache reuse, service-only
RPCs, provenance/hash preservation, ownership and transactional rollback.

Verified locally: 18 catalog unit tests, 8 database tests, catalog/database type
checks, and a production build/API smoke run. The 25-request GreatHub smoke run
measured 48 ms p95, including a 48 ms first request. A broader suite run passed
651 tests but found an unrelated pinned-GTIN mismatch in the home-office flagship
fixture; that run is not claimed as a clean repository-wide pass.

Database type generation now formats a temporary file rather than using Biome's
stdin formatter, which stalled with the CLI's compact output. `--check` still
compares generated output without overwriting tracked types.
