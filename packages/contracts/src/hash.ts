import jcs from "canonicalize";
import type { Fact } from "./catalog";
import type { ContractBody } from "./contract";
import type { Hash } from "./primitives";
import type { ProofReport } from "./proof";
import type { Requirement } from "./requirement";

/**
 * RFC 8785 (JCS) canonical JSON. Throws on values JSON cannot represent
 * (NaN, Infinity, lone surrogates, cycles, a bare `undefined`) rather than
 * hashing something the verifier would serialize differently.
 */
export function canonicalize(value: unknown): string {
  const out = jcs(value);
  if (out === undefined) {
    throw new TypeError("value has no JSON representation");
  }
  return out;
}

const encoder = new TextEncoder();

/** Lowercase hex SHA-256 of the UTF-8 bytes, via Web Crypto (Node, browser, Deno). */
export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === "string" ? encoder.encode(input) : input;
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    bytes as Uint8Array<ArrayBuffer>,
  );
  let hex = "";
  for (const b of new Uint8Array(digest))
    hex += b.toString(16).padStart(2, "0");
  return hex;
}

/** `sha256:<hex>` of the JCS form of any JSON value. */
export async function hashJson(value: unknown): Promise<Hash> {
  return `sha256:${await sha256Hex(canonicalize(value))}`;
}

/** The hash a passkey signs: SHA-256 over JCS(body) (SDD §12.1). */
export function contractHash(body: ContractBody): Promise<Hash> {
  return hashJson(body);
}

/** Identity of a requirement set: order-independent over requirement IDs. */
export function requirementSetHash(
  requirements: readonly Requirement[],
): Promise<Hash> {
  return hashJson(
    [...requirements].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  );
}

/** Hash of every report field except `hash` itself. */
export function reportHash(
  report: ProofReport | Omit<ProofReport, "hash">,
): Promise<Hash> {
  const { hash: _ignored, ...rest } = report as ProofReport;
  return hashJson(rest);
}

/**
 * Digest of the facts an item's verdicts relied on. It covers what a fact
 * claims (field, value, state, conflict) and not where or when it was
 * fetched, so a refresh that returns the same claim keeps the digest, while a
 * same-SKU spec edit changes it. Order-independent.
 */
export function factsDigest(
  facts: readonly Pick<Fact, "field" | "value" | "state" | "conflict">[],
): Promise<Hash> {
  const claims = facts
    .map(({ field, value, state, conflict }) =>
      canonicalize({ field, value, state, conflict }),
    )
    .sort();
  return hashJson(claims);
}
