# Phase 8 implementation and verification

Implemented September 26, 2026 against SDD §13.1–§13.3 and the Phase 8 checklist.

## Delivered

`@proofcart/tap` (dependency: `@noble/curves` 1.9.7; dev: `fast-check` 4):

| Module | Contents |
|---|---|
| `rfc9421.ts` | Signature base for `@method`, `@authority`, `@path`, `content-digest`; TAP params `created`, `expires`, `keyid`, `alg="ed25519"`, `nonce`, `tag`; `signRequest` / `verifyRequest`; 8-minute window |
| `digest.ts` | RFC 9530 `Content-Digest: sha-256=:…:`; verify also accepts sha-512 |
| `ed25519.ts` | Web Crypto first; `@noble/curves` fallback, probed once |
| `keys.ts` | OKP / Ed25519 JWK import and env loading |
| `jwks.ts` | Consumer cache (5 min TTL, unknown-`kid` refetch) |
| `jws.ts` | EdDSA compact JWS for scoped payment grants (used by Phase 13) |
| `structured.ts` | RFC 8941 dictionary / inner-list subset |

`@proofcart/acp` (dependencies: `tap`, `zod` 4):

| Module | Contents |
|---|---|
| `types.ts` | API-Version `2025-09-12` request/response schemas; `x_proofcart` line-item and contract extensions |
| `client.ts` | `AcpClient` + `tapSigner`; auto `Request-Id`, POST `Idempotency-Key`; typed `AcpResult` |
| `totals.ts` | `totalAmount`, `errorMessages` |

ProofCart `GET /.well-known/jwks.json` publishes the agent and grant public keys (`kty: OKP`, `crv: Ed25519`, `kid`, no `d`) with `Cache-Control: public, max-age=300`. Optional `*_PREVIOUS` env vars keep retired kids listed during rotation.

## Verified locally

- RFC 9421 Appendix B.2.6: published signature base, published signature bytes, and `edVerify` of those bytes against the Appendix B.1.4 public JWK.
- TAP policy still rejects that vector (`missing_expires`): Appendix B omits `expires` and `nonce`; SDD §13.3 requires both.
- RFC 9530 sha-256 example matches; sha-512 verify + tamper reject.
- Property tests (100 runs, Web Crypto and `@noble/curves`): sign/verify round-trip; a mutated component fails; backends cross-verify.
- JWKS publisher: secret-free export; agent + grant kids; previous agent kid kept during rotation; missing agent → null.
- ACP unit tests: version pin, strict create/update, loose session parse, auto headers, GET has no idempotency key, TAP tags (`agent-browser-auth` vs `agent-payer-auth`), and `http` / `invalid_response` / `network` / `timeout` mapping.

## Decisions and deviations from the SDD text

- **TAP policy is stricter than raw RFC 9421.** `verifyRequest` requires `expires` and, by default, `nonce`. The Appendix B vector is therefore a base-string + byte check, not a TAP `ok: true`.
- **`tag` is optional on the primitive.** `signRequest` emits it when the caller passes one. `AcpClient` always does: `agent-browser-auth` for catalog/checkout reads, `agent-payer-auth` for `/complete`.
- **Nonce replay is not in this package.** `verifyRequest` reports the nonce; DemoMart records it (T6.5). SDD §6.3's "nonce policy" here is the 8-minute window + `requireNonce`.
- **ACP `Signature` collision.** Per SDD §13.1, the client uses RFC 9421 `Signature` / `Signature-Input` and never ACP's own signature header.
- **Response schemas are loose; request schemas are strict.** A newer merchant field must not break the client. A request extra field is rejected because DemoMart validates the body.
- **Unauthorized is an ACP error type.** Not in the ACP core; used for RFC 9421 failures.

## Not done here

T6.5 TAP middleware, T6.3 DemoMart ACP routes, and T13.4 grant minting consume these packages but are later phases. The live DemoMart contract test (`demomart.contract.test.ts`) stays opt-in via `ACP_CONTRACT_*`.
