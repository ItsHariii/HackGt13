// RFC 9421 HTTP Message Signatures with Ed25519, following the Visa Trusted
// Agent Protocol profile (SDD §13.3): covered @method, @authority, @path and
// content-digest; parameters created, expires, keyid, alg, nonce, tag.

import { toBase64, toBase64Url, utf8 } from "./base64";
import { contentDigest, verifyContentDigest } from "./digest";
import {
  type Ed25519PrivateKey,
  type Ed25519PublicKey,
  edSign,
  edVerify,
} from "./ed25519";
import type { SigningKey } from "./keys";
import {
  type BareItem,
  type InnerList,
  isInnerList,
  type Params,
  parseDictionary,
  serializeBareItem,
  serializeInnerList,
} from "./structured";

export const TAP_TAGS = ["agent-browser-auth", "agent-payer-auth"] as const;
export type TapTag = (typeof TAP_TAGS)[number];

/** Visa TAP: a signature may be valid for at most 8 minutes. */
export const TAP_MAX_WINDOW_S = 480;

export const DEFAULT_COMPONENTS = ["@method", "@authority", "@path"] as const;

export interface HttpMessage {
  method: string;
  url: string | URL;
  headers: Headers | Record<string, string | undefined>;
}

function header(msg: HttpMessage, name: string): string | null {
  if (msg.headers instanceof Headers) return msg.headers.get(name);
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(msg.headers)) {
    if (k.toLowerCase() === lower && v !== undefined) return v;
  }
  return null;
}

export class SignatureBaseError extends Error {}

/** The canonical value of one covered component (RFC 9421 §2). */
export function componentValue(name: string, msg: HttpMessage): string {
  const url = new URL(String(msg.url));
  switch (name) {
    case "@method":
      return msg.method.toUpperCase();
    case "@authority":
      return url.host.toLowerCase();
    case "@scheme":
      return url.protocol.slice(0, -1).toLowerCase();
    case "@target-uri":
      return url.href;
    case "@request-target":
      return `${url.pathname || "/"}${url.search}`;
    case "@path":
      return url.pathname || "/";
    case "@query":
      return url.search || "?";
    default: {
      if (name.startsWith("@")) {
        throw new SignatureBaseError(`unsupported derived component ${name}`);
      }
      if (name !== name.toLowerCase()) {
        throw new SignatureBaseError(`component ${name} must be lowercase`);
      }
      const value = header(msg, name);
      if (value === null) {
        throw new SignatureBaseError(`missing header ${name}`);
      }
      return value
        .split("\n")
        .map((line) => line.trim())
        .join(" ")
        .trim();
    }
  }
}

/** The signature base string and the serialized `@signature-params` value. */
export function signatureBase(
  msg: HttpMessage,
  covered: InnerList,
): { base: string; paramsValue: string } {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const item of covered.items) {
    if (typeof item.value !== "string") {
      throw new SignatureBaseError("component identifiers must be strings");
    }
    if (item.params.size > 0) {
      throw new SignatureBaseError("component parameters are not supported");
    }
    if (seen.has(item.value)) {
      throw new SignatureBaseError(`duplicate component ${item.value}`);
    }
    seen.add(item.value);
    lines.push(
      `${serializeBareItem(item.value)}: ${componentValue(item.value, msg)}`,
    );
  }
  const paramsValue = serializeInnerList(covered);
  lines.push(`"@signature-params": ${paramsValue}`);
  return { base: lines.join("\n"), paramsValue };
}

export interface SignOptions {
  key: SigningKey;
  /** Covered components; `content-digest` is added automatically for a body. */
  components?: readonly string[];
  /** The exact request body bytes, when there is one. */
  body?: string | Uint8Array;
  tag?: TapTag;
  label?: string;
  /** Seconds since the epoch; defaults to now. */
  created?: number;
  /** Validity in seconds; defaults to 300, at most 480. */
  ttlSeconds?: number;
  nonce?: string;
}

export function randomNonce(bytes = 24): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/**
 * Sign a request. Returns the headers to add: `Signature-Input`, `Signature`
 * and, for a body, `Content-Digest`. Pass the same body bytes you send.
 */
export async function signRequest(
  msg: HttpMessage,
  opts: SignOptions,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const components = [...(opts.components ?? DEFAULT_COMPONENTS)];
  let headers = msg.headers;
  const hasBody =
    opts.body !== undefined &&
    (typeof opts.body === "string" ? opts.body.length : opts.body.byteLength) >
      0;
  if (hasBody && opts.body !== undefined) {
    out["Content-Digest"] = await contentDigest(opts.body);
    if (!components.includes("content-digest"))
      components.push("content-digest");
    headers = new Headers(
      msg.headers instanceof Headers
        ? msg.headers
        : (Object.entries(msg.headers).filter(([, v]) => v !== undefined) as [
            string,
            string,
          ][]),
    );
    headers.set("content-digest", out["Content-Digest"]);
  }
  const ttl = opts.ttlSeconds ?? 300;
  if (ttl <= 0 || ttl > TAP_MAX_WINDOW_S) {
    throw new RangeError(`ttlSeconds must be within 1..${TAP_MAX_WINDOW_S}`);
  }
  const created = opts.created ?? Math.floor(Date.now() / 1000);
  const params: Params = new Map<string, BareItem>([
    ["created", created],
    ["expires", created + ttl],
    ["keyid", opts.key.keyId],
    ["alg", "ed25519"],
    ["nonce", opts.nonce ?? randomNonce()],
  ]);
  if (opts.tag) params.set("tag", opts.tag);
  const covered: InnerList = {
    items: components.map((c) => ({ value: c, params: new Map() })),
    params,
  };
  const { base, paramsValue } = signatureBase({ ...msg, headers }, covered);
  const signature = await signBytes(opts.key.privateKey, utf8(base));
  const label = opts.label ?? "sig1";
  out["Signature-Input"] = `${label}=${paramsValue}`;
  out.Signature = `${label}=:${toBase64(signature)}:`;
  return out;
}

export async function signBytes(
  key: Ed25519PrivateKey,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array> {
  return edSign(key, data);
}

export type VerifyFailure =
  | "missing_signature"
  | "malformed_signature"
  | "unsupported_alg"
  | "missing_created"
  | "missing_expires"
  | "not_yet_valid"
  | "expired"
  | "window_too_long"
  | "missing_nonce"
  | "missing_keyid"
  | "wrong_tag"
  | "missing_component"
  | "missing_digest"
  | "digest_mismatch"
  | "unknown_key"
  | "bad_signature";

export interface VerifiedSignature {
  label: string;
  keyId: string;
  created: number;
  expires: number;
  nonce: string | null;
  tag: string | null;
  components: string[];
}

export type VerifyResult =
  | { ok: true; signature: VerifiedSignature }
  | {
      ok: false;
      reason: VerifyFailure;
      detail?: string;
      keyId?: string;
      tag?: string;
    };

export interface VerifyOptions {
  /** The raw body bytes as received (empty or absent for GET). */
  body?: string | Uint8Array;
  resolveKey: (keyId: string) => Promise<Ed25519PublicKey | null>;
  /** Seconds since the epoch; defaults to now. */
  now?: number;
  /** Allowed clock skew for `created`, in seconds. */
  skewSeconds?: number;
  maxWindowSeconds?: number;
  requiredComponents?: readonly string[];
  /** When set, the signature's `tag` must be one of these. */
  allowedTags?: readonly string[];
  requireNonce?: boolean;
}

function fail(
  reason: VerifyFailure,
  extra: { detail?: string; keyId?: string; tag?: string } = {},
): VerifyResult {
  return { ok: false, reason, ...extra };
}

function str(v: BareItem | undefined): string | null {
  return typeof v === "string" ? v : null;
}
function int(v: BareItem | undefined): number | null {
  return typeof v === "number" && Number.isSafeInteger(v) ? v : null;
}

/**
 * Verify an RFC 9421 signature under the TAP policy. The caller still has to
 * record the nonce (replay protection needs shared state) and log the result.
 */
export async function verifyRequest(
  msg: HttpMessage,
  opts: VerifyOptions,
): Promise<VerifyResult> {
  const inputHeader = header(msg, "signature-input");
  const sigHeader = header(msg, "signature");
  if (!inputHeader || !sigHeader) return fail("missing_signature");

  let inputs: ReturnType<typeof parseDictionary>;
  let sigs: ReturnType<typeof parseDictionary>;
  try {
    inputs = parseDictionary(inputHeader);
    sigs = parseDictionary(sigHeader);
  } catch (e) {
    return fail("malformed_signature", { detail: (e as Error).message });
  }

  // Pick the first signature whose tag is acceptable (or simply the first).
  let label: string | null = null;
  for (const [name, member] of inputs) {
    if (!isInnerList(member)) continue;
    const tag = str(member.params.get("tag"));
    if (!opts.allowedTags || (tag && opts.allowedTags.includes(tag))) {
      label = name;
      break;
    }
  }
  const firstLabel = [...inputs.keys()][0];
  if (label === null) {
    const first = firstLabel ? inputs.get(firstLabel) : undefined;
    const tag =
      first && isInnerList(first) ? str(first.params.get("tag")) : null;
    const keyId =
      first && isInnerList(first) ? str(first.params.get("keyid")) : null;
    return fail("wrong_tag", {
      ...(tag ? { tag } : {}),
      ...(keyId ? { keyId } : {}),
    });
  }
  const covered = inputs.get(label) as InnerList;
  const sigMember = sigs.get(label);
  if (
    !sigMember ||
    isInnerList(sigMember) ||
    !(sigMember.value instanceof Uint8Array)
  ) {
    return fail("malformed_signature", { detail: `no signature for ${label}` });
  }

  const p = covered.params;
  const keyId = str(p.get("keyid"));
  const tag = str(p.get("tag"));
  const ctx = { ...(keyId ? { keyId } : {}), ...(tag ? { tag } : {}) };
  if (!keyId) return fail("missing_keyid", ctx);
  const alg = p.get("alg");
  if (alg !== undefined && alg !== "ed25519")
    return fail("unsupported_alg", ctx);

  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const skew = opts.skewSeconds ?? 5;
  const created = int(p.get("created"));
  const expires = int(p.get("expires"));
  if (created === null) return fail("missing_created", ctx);
  if (expires === null) return fail("missing_expires", ctx);
  if (created > now + skew) return fail("not_yet_valid", ctx);
  if (expires <= now) return fail("expired", ctx);
  if (expires - created > (opts.maxWindowSeconds ?? TAP_MAX_WINDOW_S)) {
    return fail("window_too_long", ctx);
  }
  const nonce = str(p.get("nonce"));
  if ((opts.requireNonce ?? true) && !nonce) return fail("missing_nonce", ctx);

  const components = covered.items.map((i) => i.value);
  if (!components.every((c): c is string => typeof c === "string")) {
    return fail("malformed_signature", ctx);
  }
  for (const required of opts.requiredComponents ?? DEFAULT_COMPONENTS) {
    if (!components.includes(required)) {
      return fail("missing_component", { ...ctx, detail: required });
    }
  }
  const body = opts.body;
  const hasBody =
    body !== undefined &&
    (typeof body === "string" ? body.length : body.byteLength) > 0;
  if (hasBody) {
    if (!components.includes("content-digest")) {
      return fail("missing_component", { ...ctx, detail: "content-digest" });
    }
    if (!(await verifyContentDigest(header(msg, "content-digest"), body))) {
      return fail("digest_mismatch", ctx);
    }
  } else if (components.includes("content-digest")) {
    if (!(await verifyContentDigest(header(msg, "content-digest"), ""))) {
      return fail("missing_digest", ctx);
    }
  }

  let base: string;
  try {
    base = signatureBase(msg, covered).base;
  } catch (e) {
    return fail("missing_component", { ...ctx, detail: (e as Error).message });
  }
  const key = await opts.resolveKey(keyId);
  if (!key) return fail("unknown_key", ctx);
  const valid = await edVerify(
    key,
    new Uint8Array(sigMember.value),
    utf8(base),
  );
  if (!valid) return fail("bad_signature", ctx);
  return {
    ok: true,
    signature: { label, keyId, created, expires, nonce, tag, components },
  };
}
