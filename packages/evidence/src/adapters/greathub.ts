import {
  AcpClient,
  type AcpResult,
  type CheckoutSession,
  type Signer,
} from "@cartel/acp";
import type { Pack } from "@cartel/proof-engine";
import { type CheckoutLine, checkoutLines } from "../checkout";
import {
  type FetchLike,
  type HttpResponse,
  httpRequest,
  SourceError,
} from "../http";
import { pageClaims } from "../jsonld";
import {
  type Snapshot,
  type SnapshotStore,
  snapshot,
  snapshotResponse,
  snapshotText,
} from "../snapshot";
import type { ClaimedFact } from "../types";

/*
 * GreatHub (SDD §11.2, §16, T7.3). Every request is signed with Cartel's
 * agent key (RFC 9421, TAP profile), because GreatHub rejects unsigned agents.
 *
 * - `refreshSpecs` reads the product page's JSON-LD: merchant claims, which
 *   is what catches a same-SKU spec edit before signing and execution.
 * - `getCheckout` reads an ACP session: the authority for price and terms.
 * - `refreshOffer` prices one item through a throwaway checkout session, so
 *   an offer's price is a checkout quote, not a page scrape.
 *
 * Every response is snapshotted byte for byte before it is parsed.
 */

const LABEL = "GreatHub";

/** Origin equality, so `http://greathub.test.evil.example` is not GreatHub. */
function sameOrigin(url: string, base: string): boolean {
  try {
    return new URL(url).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

export type GreatHubOptions = {
  baseUrl: string;
  store: SnapshotStore;
  /** `tapSigner(agentKey)` from `@cartel/acp`. Required against a real GreatHub. */
  signer?: Signer;
  fetch?: FetchLike;
  timeoutMs?: number;
  now?: () => Date;
};

export type SpecRefresh = {
  source: Snapshot;
  claims: ClaimedFact[];
  found: boolean;
};
export type CheckoutRead = {
  source: Snapshot;
  session: CheckoutSession;
  lines: CheckoutLine[];
};

/** Captures the raw bytes the ACP client received so they can be snapshotted as sent. */
function recordingFetch(inner: FetchLike, now: () => Date) {
  let last: HttpResponse | null = null;
  const fetch: FetchLike = async (input, init) => {
    const fetchedAt = now().toISOString();
    const res = await inner(input, init);
    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    last = {
      url: res.url || String(input instanceof Request ? input.url : input),
      status: res.status,
      headers: res.headers,
      bytes,
      contentType: res.headers.get("content-type"),
      fetchedAt,
    };
    return res;
  };
  return { fetch, take: () => last };
}

function acpError<T>(r: AcpResult<T> & { ok: false }): SourceError {
  const kind =
    r.kind === "timeout"
      ? "timeout"
      : r.kind === "network"
        ? "network"
        : r.kind === "http"
          ? "http"
          : "invalid_response";
  return new SourceError(
    LABEL,
    kind,
    `${r.error.code}: ${r.error.message}`,
    r.status ?? undefined,
  );
}

export function createGreatHubAdapter(opts: GreatHubOptions) {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const now = () => opts.now?.() ?? new Date();
  const innerFetch: FetchLike = opts.fetch ?? fetch;

  async function signedGet(url: string): Promise<HttpResponse> {
    const headers: Record<string, string> = {
      Accept: "text/html,application/json",
    };
    if (opts.signer)
      Object.assign(
        headers,
        await opts.signer({ method: "GET", url, tag: "agent-browser-auth" }),
      );
    return httpRequest({
      source: LABEL,
      url,
      headers,
      fetch: innerFetch,
      ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
      now,
    });
  }

  /** Runs one ACP call and snapshots exactly what came back, success or not. */
  async function acp<T>(
    call: (client: AcpClient) => Promise<AcpResult<T>>,
  ): Promise<{ source: Snapshot; data: T }> {
    const rec = recordingFetch(innerFetch, now);
    const client = new AcpClient({
      baseUrl: base,
      fetch: rec.fetch as typeof fetch,
      ...(opts.signer ? { signer: opts.signer } : {}),
      ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
    });
    const result = await call(client);
    const raw = rec.take();
    if (!raw)
      throw result.ok
        ? new SourceError(LABEL, "invalid_response", "no response recorded")
        : acpError(result);
    const source = await snapshotResponse(raw, "acp_checkout", opts.store);
    if (!result.ok) throw acpError(result);
    return { source, data: result.data };
  }

  return {
    label: LABEL,

    /** Reads `/p/{slug}` and extracts JSON-LD claims for the product's roles. */
    async refreshSpecs(
      product: { slug?: string; url?: string; roles: readonly string[] },
      packs: readonly Pack[],
    ): Promise<SpecRefresh> {
      const url =
        product.url ??
        (product.slug ? `${base}/p/${encodeURIComponent(product.slug)}` : null);
      if (!url || !sameOrigin(url, base))
        throw new SourceError(
          LABEL,
          "invalid_response",
          "product page is not on GreatHub",
        );
      const res = await signedGet(url);
      const source = await snapshotResponse(res, "json_ld", opts.store);
      if (res.status !== 200)
        throw new SourceError(LABEL, "http", `HTTP ${res.status}`, res.status);
      const { product: node, claims } = pageClaims(snapshotText(source), {
        packs,
        roles: product.roles,
      });
      return { source, claims, found: node !== null };
    },

    /** The authoritative state of a checkout session (SDD §13.2: read right before execution). */
    async getCheckout(sessionId: string): Promise<CheckoutRead> {
      const { source, data } = await acp((c) => c.getSession(sessionId));
      return {
        source,
        session: data,
        lines: checkoutLines(data, source.fetchedAt),
      };
    },

    /**
     * Prices one item through a checkout session that is created, read and
     * canceled. The session is the evidence; cancelation is best effort.
     */
    async refreshOffer(
      itemId: string,
    ): Promise<CheckoutRead & { line: CheckoutLine | null }> {
      const { source, data } = await acp((c) =>
        c.createSession({ items: [{ id: itemId, quantity: 1 }] }),
      );
      await acp((c) => c.cancelSession(data.id)).catch(() => undefined);
      const lines = checkoutLines(data, source.fetchedAt);
      return {
        source,
        session: data,
        lines,
        line: lines.find((l) => l.itemId === itemId) ?? null,
      };
    },
  };
}

/** Records a seeded spec sheet as a `fixture` source, so seeded facts have real provenance too. */
export function snapshotFixture(
  store: SnapshotStore,
  url: string,
  body: string,
  contentType = "application/json",
) {
  return snapshot(
    { url, sourceType: "fixture", body, contentType, httpStatus: 200 },
    store,
  );
}
