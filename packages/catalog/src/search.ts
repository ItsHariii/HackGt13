import type { Requirement } from "@proofcart/contracts";
import type { Pack } from "@proofcart/proof-engine";
import { buildFacets, type Facet } from "./facets";
import { type CatalogProduct, rankProducts } from "./product";

export type SearchStatus =
  | "ok"
  | "cached"
  | "timeout"
  | "error"
  | "not_configured"
  | "rate_limited";
export type SearchChunk = {
  source: string;
  status: SearchStatus;
  products: CatalogProduct[];
  facets: Facet[];
  elapsedMs: number;
};
export type SearchProvider = {
  source: string;
  search(
    query: string,
    limit: number,
    signal: AbortSignal,
  ): Promise<{ products: CatalogProduct[]; cached?: boolean }>;
};
export type SearchOptions = {
  query: string;
  limit?: number;
  providers: readonly SearchProvider[];
  requirements?: readonly Requirement[];
  packs: readonly Pack[];
  signal?: AbortSignal;
  timeoutMs?: number;
  now?: () => Date;
};

/** All providers start together; slow or failed sources cannot delay a completed line. */
export function searchStream(
  options: SearchOptions,
): ReadableStream<Uint8Array> {
  const abort = new AbortController();
  const parentAbort = () => abort.abort();
  options.signal?.addEventListener("abort", parentAbort, { once: true });
  if (options.signal?.aborted) abort.abort();
  const encoder = new TextEncoder();
  let cancelled = false;
  return new ReadableStream({
    start(controller) {
      const jobs = options.providers.map(async (provider) => {
        const started = performance.now();
        const sourceAbort = new AbortController();
        const signal = AbortSignal.any([abort.signal, sourceAbort.signal]);
        let timer: ReturnType<typeof setTimeout> | undefined;
        let onAbort: (() => void) | undefined;
        try {
          const deadline = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              reject(new Error("timeout"));
              sourceAbort.abort();
            }, options.timeoutMs ?? 2500);
            onAbort = () => reject(new Error("cancelled"));
            abort.signal.addEventListener("abort", onAbort, { once: true });
            if (abort.signal.aborted) onAbort();
          });
          // Include proof/facet computation in the deadline, not just the HTTP fetch.
          const work = async () => {
            signal.throwIfAborted();
            const result = await provider.search(
              options.query,
              options.limit ?? 20,
              signal,
            );
            signal.throwIfAborted();
            const now = (options.now?.() ?? new Date()).toISOString();
            const products = rankProducts(
              result.products,
              options.requirements ?? [],
              options.packs,
              now,
            ).slice(0, options.limit ?? 20);
            return {
              source: provider.source,
              status: result.cached ? "cached" : "ok",
              products,
              facets: buildFacets(products, options.packs, now),
            } as const;
          };
          const chunk = await Promise.race([work(), deadline]);
          if (!cancelled && !abort.signal.aborted)
            controller.enqueue(
              encoder.encode(
                `${JSON.stringify({ ...chunk, elapsedMs: Math.round(performance.now() - started) })}\n`,
              ),
            );
        } catch (error) {
          const kind =
            error && typeof error === "object" && "kind" in error
              ? error.kind
              : undefined;
          const status: SearchStatus = sourceAbort.signal.aborted
            ? "timeout"
            : kind === "not_configured"
              ? "not_configured"
              : kind === "rate_limited"
                ? "rate_limited"
                : kind === "timeout"
                  ? "timeout"
                  : "error";
          if (!cancelled && !abort.signal.aborted)
            controller.enqueue(
              encoder.encode(
                `${JSON.stringify({ source: provider.source, status, products: [], facets: [], elapsedMs: Math.round(performance.now() - started) } satisfies SearchChunk)}\n`,
              ),
            );
        } finally {
          clearTimeout(timer);
          if (onAbort) abort.signal.removeEventListener("abort", onAbort);
        }
      });
      void Promise.allSettled(jobs).then(() => {
        options.signal?.removeEventListener("abort", parentAbort);
        if (!cancelled) controller.close();
      });
    },
    cancel() {
      cancelled = true;
      abort.abort();
      options.signal?.removeEventListener("abort", parentAbort);
    },
  });
}
