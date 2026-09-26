// A small JWKS client: 5-minute cache, rotation through `kid`, and a rate-limited
// refetch when an unknown `kid` shows up.

import type { Ed25519PublicKey } from "./ed25519";
import {
  type Ed25519PublicJwk,
  importPublicJwk,
  isEd25519PublicJwk,
} from "./keys";

export interface JwksCacheOptions {
  ttlMs?: number;
  /** Minimum gap between refetches triggered by an unknown `kid`. */
  minRefreshMs?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
}

interface Entry {
  jwk: Ed25519PublicJwk;
  key: Ed25519PublicKey;
}

export class JwksError extends Error {}

export class JwksCache {
  private keys = new Map<string, Entry>();
  private fetchedAt = Number.NEGATIVE_INFINITY;
  private inflight: Promise<void> | null = null;
  private readonly ttlMs: number;
  private readonly minRefreshMs: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(
    readonly url: string,
    opts: JwksCacheOptions = {},
  ) {
    this.ttlMs = opts.ttlMs ?? 300_000;
    this.minRefreshMs = opts.minRefreshMs ?? 30_000;
    this.timeoutMs = opts.timeoutMs ?? 3_000;
    this.fetchImpl = opts.fetch ?? fetch;
    this.now = opts.now ?? Date.now;
  }

  /** The verification key for `kid`, or null when the JWKS doesn't list it. */
  async getKey(kid: string): Promise<Ed25519PublicKey | null> {
    return (await this.getEntry(kid))?.key ?? null;
  }

  async getJwk(kid: string): Promise<Ed25519PublicJwk | null> {
    return (await this.getEntry(kid))?.jwk ?? null;
  }

  private async getEntry(kid: string): Promise<Entry | null> {
    const age = this.now() - this.fetchedAt;
    if (age > this.ttlMs) await this.refresh();
    const hit = this.keys.get(kid);
    if (hit) return hit;
    if (this.now() - this.fetchedAt > this.minRefreshMs) {
      await this.refresh();
      return this.keys.get(kid) ?? null;
    }
    return null;
  }

  private refresh(): Promise<void> {
    this.inflight ??= this.load().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async load(): Promise<void> {
    const res = await this.fetchImpl(this.url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new JwksError(`JWKS returned HTTP ${res.status}`);
    const body = (await res.json()) as { keys?: unknown };
    if (!Array.isArray(body.keys))
      throw new JwksError("JWKS has no keys array");
    const next = new Map<string, Entry>();
    for (const jwk of body.keys) {
      if (!isEd25519PublicJwk(jwk) || !jwk.kid) continue;
      if (jwk.use !== undefined && jwk.use !== "sig") continue;
      next.set(jwk.kid, { jwk, key: await importPublicJwk(jwk) });
    }
    this.keys = next;
    this.fetchedAt = this.now();
  }
}
