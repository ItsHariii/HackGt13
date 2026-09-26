# Phase 13 — Checkout and payments

Phase 13 adds guarded execution, tokenized enrollment, merchant outcome handling,
Shopify hand-off, and payment UI. The implementation runs against the existing
Phase 2 guard and Phase 6 ACP merchant. It never supplies a fabricated signature
or skips the guard when Phase 12 signing has not yet produced a signed contract.

## Routes and screens

- `/settings/payment`: Microform v2 hosted number/security-code fields, billing
  address and expiration, saved masked details; AcceptUI (Accept.js) for the
  Authorize.net fallback; a visibly labeled simulated method.
- `POST /api/payments/capture-context`: authenticated, same-origin, server-configured
  capture origin. The client loads the provider-returned library with SRI.
- `GET/POST /api/payments/instruments`: only tokenized input is accepted. Only
  `rail_ref`, rail, brand, last four and expiration are persisted alongside owner/id.
  Neither transient tokens nor billing addresses are persisted.
- `POST /api/checkout/[versionId]/execute`: `{ "instrumentId": "<uuid>" }` with
  `Idempotency-Key` (8–255 printable characters). Ownership, signature and signed
  body checks precede execution. Return states: `paid` (200), `declined` (402),
  `paused` (409, classification and diff ID), `reconcile_required` (202).
- `POST /api/webhooks/greathub`: authenticates the raw body with HMAC-SHA256 and a
  five-minute timestamp tolerance. A SQL transaction deduplicates provider/event ID,
  matches contract/session/amount/currency/rail, completes an in-flight execution,
  updates the order and ledger, and prevents late events from regressing status.
- `/plans/[id]/checkout`: explicit check/pay and retry controls, unresolved-outcome
  reconciliation, paused announcement, simulation label, and merchant status table.
- `POST /api/handoff/[versionId]`: UCP discovery → create cart → create checkout →
  get checkout → fresh catalog evidence → proof/diff → ledger → store URL. No payment
  execution or grant is created. The UI explains the boundary after hand-off.

## Signing integration

The existing checkout guard requires a **real verified signature** in
`contract_signatures`. Phase 12's registration/signing routes are still absent
in this checkout. The fixture workspace is not a signed purchase.

The contract-drafting flow must call `bindApprovedCheckout(versionId, sessionId,
approvedState)` from `apps/web/lib/checkout-approval.ts` before signing. It verifies
report/body/item linkage and persists the original proof inputs as an approval
snapshot. The SQL wrapper rejects rebinding after signing. Execution loads this
original snapshot; it never reconstructs what the user approved from today's
catalog. The ACP session must carry the same contract ID, version and body hash.

Each merchant needs its own signed version and checkout. The current database
has one execution per version, so a single version spanning several merchants is
rejected. The status table supports separate contracts belonging to the same plan.
There is no distributed payment transaction or automatic rollback promise.

## Enrollment and rail configuration

Set in Cartel and GreatHub:

- `PAYMENT_RAIL=visa_acceptance|authorize_net|simulated|vic`
- Visa: `VISA_ACCEPTANCE_RUN_ENV=apitest.cybersource.com`, merchant ID, key ID,
  shared secret. Both apps must use the same sandbox merchant/token environment.
- Authorize.net: `AUTHORIZE_NET_API_LOGIN_ID`, `AUTHORIZE_NET_TRANSACTION_KEY`;
  Cartel also needs `NEXT_PUBLIC_AUTHORIZE_NET_CLIENT_KEY`.
- Cartel: `CARTEL_BASE_URL` (falls back to `WEBAUTHN_ORIGIN`), agent and grant
  signing JWK/key IDs, `GREATHUB_BASE_URL`.
- Both apps: the same `GREATHUB_WEBHOOK_SECRET`.

Visa enrollment uses the documented alternative: `POST /pts/v2/payments` with a
zero-dollar authorization, `capture: false`, `TOKEN_CREATE`, customer and payment
instrument token types, and `tokenInformation.transientTokenJwt`. It reads masked
card details from `GET /tms/v1/paymentinstruments/{id}`. The merchant account must
have TMS enabled. No raw-card fallback is used for enrollment.

The Authorize.net adapter exchanges an Accept.js nonce for a CIM customer/payment
profile and charges that profile with `authCaptureTransaction`. VIC remains an
explicit unavailable stub with the intended passkey/instruction/credential/outcome
sequence documented in code; selecting it never silently falls back to another rail.

The simulated rail always has the label “Simulated payment. No network call.”
Unconfigured Visa/Authorize.net selections fail instead of silently simulating.

Primary integration references:

- [Microform v2 capture context](https://developer.cybersource.com/docs/cybs/en-us/digital-accept-flex/developer/all/rest/digital-accept-flex/microform-integ-v2/micro-v2-reference/flex-capture-context-api-intro.html)
- [Cybersource token management](https://developer.cybersource.com/docs/cybs/en-us/tms/developer/all/rest/tms.html)
- [Accept.js and its hosted form](https://developer.authorize.net/api/reference/features/acceptjs.html)
- [Authorize.net customer profiles](https://developer.authorize.net/api/reference/features/customer-profiles.html)
- [Shopify cart creation](https://shopify.dev/docs/agents/get-started/build-a-cart)
- [Shopify checkout and hand-off](https://shopify.dev/docs/agents/get-started/checkout)

## Retry and reconciliation behavior

`begin_execution` records a guarded attempt; `consume_execution_token` atomically
allows one dispatcher. The resulting ten-minute EdDSA grant is scoped to merchant,
contract/hash, owner, currency, instrument and the freshly proved amount. GreatHub
also requires the grant's `quotedTotalMinor` to match its live total, so even a
price decrease between re-proof and charging cannot create a mismatched receipt.
Legacy grants without that optional claim retain their maximum-only scope. GreatHub
reserves the grant ID **before** charging, including across different checkout
sessions. An unknown outcome retains the checkout claim indefinitely. The previous
two-minute automatic claim expiry is removed.

A definite decline completes the attempt. Only an explicit new user action with a
new key starts another attempt. A timeout, network error, malformed response, or
processor uncertainty stays in flight. Repeated execute requests reconcile through
ACP GET and do not call complete again, even with a different key. An unpaid ACP
session alone does not prove that a processor timeout was a decline; it remains
unresolved until an order/webhook arrives or the processor is reconciled manually.

## Shopify constraints

Set `SHOPIFY_AGENT_PROFILE_URL`, `SHOPIFY_ACCESS_TOKEN`, and a comma-separated
`SHOPIFY_HANDOFF_ORIGINS` allowlist. All merchant origins, discovery endpoints and
returned checkout URLs must stay on an explicitly configured HTTPS origin.
Redirects are not followed. The published agent profile declares cart and checkout
capabilities as well as catalog.

Checkout totals must be complete (shipping and tax included). Missing specs,
unknown hard rules without matching waivers, or missing signed return/recurring/
variant terms pause hand-off. UCP core does not supply all those terms, so this
integration deliberately cannot hand off every Shopify product/contract. It does
not pretend that missing data matches the signed contract. Live Shopify validation
requires a reachable agent profile and authorized merchant access.

## Verification

Migrations `0103_checkout.sql` and `0104_checkout_handoff.sql` were applied to local
Supabase without resetting data. Production/cloud migrations are not applied.

- Repository typecheck: all 15 packages passed.
- Repository tests: 756 passed, 26 opt-in tests skipped.
- Production build: all 14 build tasks passed.
- Lint: passed with seven existing GreatHub CSS specificity warnings.
- SQL: 161 assertions passed, including webhook-before-response, dedupe,
  mismatched amount rollback, late events, signed snapshot binding, cross-session
  grant replay and persistent unknown-outcome locks.
- SQL lint: no schema errors.
- Visa smoke: real sandbox $1 test passed.
- Live Microform → transient token → zero-dollar authorization → TMS enrollment
  passed; the browser sent only the transient token to the test server. Saved
  metadata matched Visa / 1111 / December 2031. Run the opt-in
  `apps/web/lib/payment-enrollment.smoke.test.ts` with `VISA_ENROLLMENT_SMOKE=1`
  and sandbox credentials (`CHROME_PATH` optionally selects a browser executable).
- GreatHub ACP contract suite with Visa sandbox: all 19 tests passed.
- Desktop and 375px mobile browser checks: no page errors or horizontal overflow,
  no serious/critical axe findings; an explicit decline retry generated a new key.
  Browser status and payment responses were mocked for these UI checks.
- Checkout unit tests include the flagship same-SKU USB-C downgrade, happy path,
  concurrent dispatch, decline replay, timeout reconciliation and hash tampering.

Live Authorize.net enrollment and live Shopify hand-off
still require provider-specific end-to-end verification. The complete browser
brief → sign → pay journey additionally depends on Phase 12 and the contract-draft
integration above. Do not mark those acceptance checks verified based on mocks.
