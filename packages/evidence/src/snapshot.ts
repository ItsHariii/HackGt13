import { sha256Hex } from "@proofcart/contracts";
import { bytesToText, type HttpResponse } from "./http";
import type { SourceRecord, SourceType } from "./types";

/*
 * Snapshotter (SDD §11.3, T7.1). Every fetch stores its raw bytes at
 * `sources/{sha256}.{ext}` and gets a `sources` row, so every fact can point
 * at the exact document it was read from. Objects are content-addressed:
 * refetching an unchanged page reuses the object but still records the
 * fetch, because "seen unchanged at 10:42" is itself evidence.
 */

export type NewSource = Omit<SourceRecord, "id">;

/** Where snapshots go. `supabaseEvidenceStore` is the production implementation. */
export interface SnapshotStore {
  /** Stores bytes at a content-addressed path. Must succeed if the object already exists. */
  putObject(
    path: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void>;
  insertSource(row: NewSource): Promise<SourceRecord>;
  /** The newest successful fetch of `url` at or after `since`, for the response cache. */
  findRecentSource(
    url: string,
    sourceType: SourceType,
    since: string,
  ): Promise<SourceRecord | null>;
  getObject(path: string): Promise<Uint8Array | null>;
}

export type Snapshot = SourceRecord & {
  bytes: Uint8Array;
  /** True when served from an earlier snapshot instead of the network. */
  cached: boolean;
};

export type SnapshotInput = {
  url: string;
  sourceType: SourceType;
  body: Uint8Array | string;
  contentType?: string | null;
  httpStatus?: number | null;
  fetchedAt?: string;
};

const EXTENSIONS: [RegExp, string][] = [
  [/^application\/(?:ld\+)?json$|\+json$/, "json"],
  [/^text\/html$|^application\/xhtml\+xml$/, "html"],
  [/^(?:application|text)\/xml$|\+xml$/, "xml"],
  [/^text\/plain$/, "txt"],
  [/^text\/event-stream$/, "txt"],
  [/^application\/pdf$/, "pdf"],
  [/^image\/png$/, "png"],
  [/^image\/jpe?g$/, "jpg"],
  [/^image\/webp$/, "webp"],
];

/** `text/html; charset=utf-8` → `text/html`. */
export function mediaType(
  contentType: string | null | undefined,
): string | null {
  const t = contentType?.split(";")[0]?.trim().toLowerCase();
  return t || null;
}

export function extensionFor(contentType: string | null | undefined): string {
  const t = mediaType(contentType);
  if (!t) return "bin";
  return EXTENSIONS.find(([re]) => re.test(t))?.[1] ?? "bin";
}

const encoder = new TextEncoder();

/** Hashes, stores and records one fetched document. */
export async function snapshot(
  input: SnapshotInput,
  store: SnapshotStore,
): Promise<Snapshot> {
  const bytes =
    typeof input.body === "string" ? encoder.encode(input.body) : input.body;
  const hex = await sha256Hex(bytes);
  const contentType = mediaType(input.contentType);
  const storagePath = `${hex}.${extensionFor(contentType)}`;
  await store.putObject(
    storagePath,
    bytes,
    contentType ?? "application/octet-stream",
  );
  const record = await store.insertSource({
    url: input.url,
    sourceType: input.sourceType,
    contentHash: `sha256:${hex}`,
    contentType,
    storagePath,
    httpStatus: input.httpStatus ?? null,
    fetchedAt: input.fetchedAt ?? new Date().toISOString(),
  });
  return { ...record, bytes, cached: false };
}

/** Snapshots an HTTP response as fetched. */
export function snapshotResponse(
  res: HttpResponse,
  sourceType: SourceType,
  store: SnapshotStore,
  /** Records a cache key instead of the request URL (e.g. an MCP tool call). */
  url: string = res.url,
): Promise<Snapshot> {
  return snapshot(
    {
      url,
      sourceType,
      body: res.bytes,
      contentType: res.contentType,
      httpStatus: res.status,
      fetchedAt: res.fetchedAt,
    },
    store,
  );
}

export type CachedFetch = {
  /** The URL (or cache key) the snapshot is recorded under. */
  key: string;
  sourceType: SourceType;
  /** Reuse a successful snapshot this recent. 0 disables the cache. */
  ttlMs: number;
  now?: () => Date;
  fetch(): Promise<HttpResponse>;
};

/**
 * Serves a recent successful snapshot of the same key when there is one
 * (SDD §11.6: the cache absorbs repeat traffic), otherwise fetches and
 * snapshots. Failed responses are snapshotted too but never served from cache.
 */
export async function cachedFetch(
  req: CachedFetch,
  store: SnapshotStore,
): Promise<Snapshot> {
  if (req.ttlMs > 0) {
    const since = new Date(
      (req.now?.() ?? new Date()).getTime() - req.ttlMs,
    ).toISOString();
    const hit = await store.findRecentSource(req.key, req.sourceType, since);
    if (hit?.storagePath) {
      const bytes = await store.getObject(hit.storagePath);
      if (bytes) return { ...hit, bytes, cached: true };
    }
  }
  const res = await req.fetch();
  return snapshotResponse(res, req.sourceType, store, req.key);
}

export function snapshotText(s: Pick<Snapshot, "bytes">): string {
  return bytesToText(s.bytes);
}

export function isSuccess(s: Pick<SourceRecord, "httpStatus">): boolean {
  return s.httpStatus !== null && s.httpStatus >= 200 && s.httpStatus < 300;
}
