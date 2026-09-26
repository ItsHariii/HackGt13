import { sha256Hex } from "@cartel/contracts";
import { describe, expect, it } from "vitest";
import { SourceError } from "./http";
import { cachedFetch, extensionFor, snapshot } from "./snapshot";
import { memoryStore } from "./test-utils";

const res = (body: string, status = 200, contentType = "application/json") => ({
  url: "https://example.test/x",
  status,
  headers: new Headers({ "content-type": contentType }),
  bytes: new TextEncoder().encode(body),
  contentType,
  fetchedAt: new Date().toISOString(),
});

describe("snapshot", () => {
  it("stores bytes content-addressed and records every fetch", async () => {
    const { store, objects, sources } = memoryStore();
    const body = '{"price":329}';
    const a = await snapshot(
      {
        url: "https://m.test/p/1",
        sourceType: "json_ld",
        body,
        contentType: "application/json; charset=utf-8",
        httpStatus: 200,
      },
      store,
    );
    const b = await snapshot(
      {
        url: "https://m.test/p/1",
        sourceType: "json_ld",
        body,
        contentType: "application/json",
        httpStatus: 200,
      },
      store,
    );
    const hex = await sha256Hex(body);
    expect(a.contentHash).toBe(`sha256:${hex}`);
    expect(a.storagePath).toBe(`${hex}.json`);
    expect(a.contentType).toBe("application/json");
    expect(objects.size).toBe(1);
    expect(sources).toHaveLength(2);
    expect(a.id).not.toBe(b.id);
  });

  it("picks an extension from the media type", () => {
    expect(extensionFor("text/html; charset=utf-8")).toBe("html");
    expect(extensionFor("application/ld+json")).toBe("json");
    expect(extensionFor("application/problem+json")).toBe("json");
    expect(extensionFor("application/rss+xml")).toBe("xml");
    expect(extensionFor(null)).toBe("bin");
    expect(extensionFor("application/x-weird")).toBe("bin");
  });
});

describe("cachedFetch", () => {
  it("serves a recent successful snapshot without calling the source", async () => {
    const { store } = memoryStore();
    let calls = 0;
    const req = {
      key: "https://api.test/search?q=monitor",
      sourceType: "upcitemdb" as const,
      ttlMs: 60_000,
      fetch: async () => {
        calls++;
        return res('{"ok":true}');
      },
    };
    const first = await cachedFetch(req, store);
    const second = await cachedFetch(req, store);
    expect(calls).toBe(1);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(new TextDecoder().decode(second.bytes)).toBe('{"ok":true}');
    expect(second.id).toBe(first.id);
  });

  it("never serves a failed response from cache, and honors the TTL", async () => {
    const { store } = memoryStore();
    let status = 500;
    let now = new Date("2026-09-26T10:00:00Z");
    const req = {
      key: "k",
      sourceType: "icecat" as const,
      ttlMs: 60_000,
      now: () => now,
      fetch: async () => ({
        ...res("{}", status),
        fetchedAt: now.toISOString(),
      }),
    };
    expect((await cachedFetch(req, store)).httpStatus).toBe(500);
    status = 200;
    expect((await cachedFetch(req, store)).cached).toBe(false);
    expect((await cachedFetch(req, store)).cached).toBe(true);
    now = new Date("2026-09-26T10:02:00Z");
    expect((await cachedFetch(req, store)).cached).toBe(false);
  });

  it("propagates source errors without recording a snapshot", async () => {
    const { store, sources } = memoryStore();
    await expect(
      cachedFetch(
        {
          key: "k",
          sourceType: "cpsc",
          ttlMs: 0,
          fetch: async () => {
            throw new SourceError("CPSC", "timeout", "slow");
          },
        },
        store,
      ),
    ).rejects.toMatchObject({ kind: "timeout" });
    expect(sources).toHaveLength(0);
  });
});
