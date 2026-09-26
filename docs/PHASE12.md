# Phase 12 — Signing

Passkey signing of one exact contract version (SDD §12.2). SimpleWebAuthn v13
verifies registration and assertions. The same assertion must also pass the
offline verifier in `@cartel/contracts` (`verifyContractSignature`), so every
stored signature can be re-verified from an Evidence Pack.

## Routes and screens

All routes are `POST`, same-origin (`Origin` must equal `WEBAUTHN_ORIGIN`), and
authenticated with the Supabase session.

- `/api/signing/register/options` → creation options: `userVerification: 'required'`,
  `residentKey: 'preferred'`, attestation `none`, ES256/EdDSA/RS256 (what the
  offline verifier supports), and existing keys excluded.
- `/api/signing/register/verify` `{ response, label? }` → stores the credential
  in `signing_credentials` (COSE public key, counter, transports).
- `/api/signing/options` `{ contractVersionId }` → loads the stored body, checks
  that `contractHash(body)` equals `body_hash`, and stores a 2-minute challenge
  `ct1:{H}:{N}` (N = 18 random bytes, base64url). Returns request options with
  `userVerification: 'required'` and `allowCredentials` set to the user's signing keys.
- `/api/signing/verify` `{ response }` → consumes the challenge, re-hashes the
  body, verifies with `expectedChallenge = isoBase64URL.fromUTF8String(challenge)`,
  origin, RP ID, credential and counter, re-verifies offline, then records it.
- `/settings/signing`: lists keys (RLS), adds a key, or adds one via "Use my phone".
- `components/signing/sign-contract.tsx`: "Sign with passkey". The SIGNED stamp
  appears only after the server has verified the signature. A cancelled or
  unsupported ceremony shows "Signing cancelled. Nothing was signed." with
  **Try again** and **Use my phone**. Use my phone adds the `hybrid` hint and
  transport. The contract review page (T11) mounts this component.

## Database (`0105_signing.sql`)

- `internal.signing_registration_challenges`: server-only, one per user, 2 minutes.
- `srv_begin_signing`: locks the version and checks owner, `awaiting_signature`,
  not expired, no newer version, hash equality, the `ct1:{H}:{N}` shape, and that
  a signing key exists.
- `srv_consume_signing_challenge`: deletes the challenge **before** any
  verification and reports whether it had expired. A failed attempt therefore
  can never be replayed. This is the "delete the challenge" step of T12.3. It is
  a separate earlier transaction so that the deletion also survives a failure.
- `srv_record_contract_signature`: one transaction. It re-runs the version
  checks, requires the credential to belong to the user, requires the counter to
  increase (when either value is non-zero), inserts `contract_signatures`
  (verified, with the credential's public key), advances the counter, and calls
  `internal.transition_contract(..., 'signed', 'contract.signed')`. That call
  moves the status and appends to the ledger.

All `srv_` functions are revoked from `anon`/`authenticated` and granted to `service_role`.

## Configuration

`WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`, `WEBAUTHN_RP_NAME` (default `Cartel`).
The RP ID must be the stable production domain. Preview deployments will not
match it.

## Verification

- `apps/web/lib/signing-service.test.ts` (13 tests) drives the real SimpleWebAuthn
  verification with a software ES256 authenticator (a `none` attestation and
  assertions). T12.5 cases: tampered body, assertion over another hash, reused
  challenge, wrong origin (the challenge is spent), wrong RP ID, expired challenge,
  another user's credential, forged signature, reused/UV-less registration.
- `supabase/tests/signing.test.sql` (25 assertions): challenge lifecycle,
  ownership, supersession, expiry, counter regression, the signed transition,
  the ledger entry, and privileges. These ran against a local Postgres 16 with
  Supabase auth/realtime stubs. The Supabase CLI stack (Docker) was unavailable
  here, so CI's `database` job is the authoritative run. `packages/contracts/src/db.ts`
  was extended by hand in generator order, and CI's `db:types:check` confirms it.
- Browser: in Chromium with a CDP virtual authenticator against `next start`,
  failed user verification showed "Nothing was signed." and "Use my phone".
  **Try again** then produced a real assertion. The service (with an in-memory
  store) verified it, and the SIGNED v7 stamp appeared.
  `/settings/signing` is axe-clean at 1440 and 390 px.

Not yet verified: the full browser flow with a live Supabase session and a
contract drafted by the T11 contract screen. The complete brief → sign → pay
acceptance in Phase 13 still depends on that screen.
