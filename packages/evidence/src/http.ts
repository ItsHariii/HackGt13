/*
 * The one place adapters touch the network. Every call has a deadline and a
 * size cap, and failures come back as a typed SourceError so a federated
 * search can show "UPCitemdb · timed out" instead of breaking the page.
 */

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type SourceErrorKind =
  | "http"
  | "network"
  | "timeout"
  | "rate_limited"
  | "too_large"
  | "invalid_response"
  | "not_configured";

export class SourceError extends Error {
  constructor(
    readonly source: string,
    readonly kind: SourceErrorKind,
    message: string,
    readonly status?: number,
    /** When the source said to come back, for `rate_limited`. */
    readonly retryAfterMs?: number,
  ) {
    super(`${source}: ${message}`);
    this.name = "SourceError";
  }
}

export type HttpResponse = {
  url: string;
  status: number;
  headers: Headers;
  bytes: Uint8Array;
  contentType: string | null;
  fetchedAt: string;
};

export type HttpRequest = {
  source: string;
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  maxBytes?: number;
  signal?: AbortSignal;
  now?: () => Date;
};

/** The `sources` bucket's per-object limit (0011_storage.sql). */
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
export const DEFAULT_TIMEOUT_MS = 8_000;

/** Fetches a URL without throwing on HTTP errors; the caller decides what a status means. */
export async function httpRequest(req: HttpRequest): Promise<HttpResponse> {
  const doFetch = req.fetch ?? fetch;
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (req.signal) signals.push(req.signal);
  const fetchedAt = (req.now?.() ?? new Date()).toISOString();
  let res: Response;
  try {
    res = await doFetch(req.url, {
      method: req.method ?? "GET",
      ...(req.headers ? { headers: req.headers } : {}),
      ...(req.body !== undefined ? { body: req.body } : {}),
      signal: AbortSignal.any(signals),
      redirect: "follow",
      cache: "no-store",
    });
  } catch (e) {
    if ((e as Error).name === "TimeoutError") {
      throw new SourceError(
        req.source,
        "timeout",
        `no response within ${timeoutMs} ms`,
      );
    }
    throw new SourceError(
      req.source,
      "network",
      (e as Error).message || "request failed",
    );
  }
  const maxBytes = req.maxBytes ?? MAX_SOURCE_BYTES;
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    throw new SourceError(
      req.source,
      "too_large",
      `${declared} bytes exceeds ${maxBytes}`,
      res.status,
    );
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    const timeout = (e as Error).name === "TimeoutError";
    throw new SourceError(
      req.source,
      timeout ? "timeout" : "network",
      "response body interrupted",
      res.status,
    );
  }
  if (bytes.byteLength > maxBytes) {
    throw new SourceError(
      req.source,
      "too_large",
      `${bytes.byteLength} bytes exceeds ${maxBytes}`,
      res.status,
    );
  }
  return {
    url: res.url || req.url,
    status: res.status,
    headers: res.headers,
    bytes,
    contentType: res.headers.get("content-type"),
    fetchedAt,
  };
}

const decoder = new TextDecoder();

export function bytesToText(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

/** Parses a JSON body, or throws `invalid_response`. */
export function parseJsonBody(source: string, bytes: Uint8Array): unknown {
  try {
    return JSON.parse(bytesToText(bytes));
  } catch {
    throw new SourceError(source, "invalid_response", "response is not JSON");
  }
}

/** `Retry-After` as milliseconds (seconds or an HTTP date); undefined if absent or unreadable. */
export function retryAfterMs(
  headers: Headers,
  now: Date = new Date(),
): number | undefined {
  const v = headers.get("retry-after");
  if (!v) return undefined;
  if (/^\d+$/.test(v.trim())) return Number(v) * 1000;
  const at = Date.parse(v);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now.getTime());
}

/** Resolves after `ms`, or rejects early when the signal aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
