// In-memory stand-ins for the Supabase store, with the same semantics as
// srv_write_facts (optimistic check, supersede, sticky conflict flags).
import type { FactStore, FactWriteGroup, SubjectRef } from "./fact-store";
import { StaleFactPlanError } from "./fact-store";
import type { FetchLike } from "./http";
import type { NewSource, SnapshotStore } from "./snapshot";
import type { SourceRecord, SourceType, StoredFact } from "./types";

type Row = StoredFact & { supersededBy: string | null };

export function memoryStore() {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const sources: SourceRecord[] = [];
  const facts: Row[] = [];
  let seq = 0;
  const id = (prefix: string) => `${prefix}-${String(++seq).padStart(4, "0")}`;

  const store: SnapshotStore & FactStore = {
    async putObject(path, bytes, contentType) {
      if (!objects.has(path)) objects.set(path, { bytes, contentType });
    },
    async insertSource(row: NewSource) {
      const rec = { ...row, id: id("src") };
      sources.push(rec);
      return rec;
    },
    async findRecentSource(url: string, sourceType: SourceType, since: string) {
      return (
        sources
          .filter(
            (s) =>
              s.url === url &&
              s.sourceType === sourceType &&
              s.fetchedAt >= since &&
              s.httpStatus !== null &&
              s.httpStatus >= 200 &&
              s.httpStatus < 300,
          )
          .sort((a, b) => (a.fetchedAt < b.fetchedAt ? 1 : -1))[0] ?? null
      );
    },
    async getObject(path) {
      return objects.get(path)?.bytes ?? null;
    },
    async currentFacts(
      subjects: readonly SubjectRef[],
      fields?: readonly string[],
    ) {
      const keys = new Set(subjects.map((s) => `${s.kind}:${s.id}`));
      return facts
        .filter(
          (f) =>
            f.supersededBy === null &&
            keys.has(`${f.subjectKind}:${f.subjectId}`),
        )
        .filter((f) => !fields || fields.includes(f.field))
        .map(({ supersededBy: _, ...f }) => ({ ...f }));
    },
    async applyFactWrites(groups: readonly FactWriteGroup[]) {
      for (const g of groups) {
        const current = facts
          .filter(
            (f) =>
              f.supersededBy === null &&
              f.subjectId === g.subjectId &&
              f.subjectKind === g.subjectKind &&
              f.field === g.field,
          )
          .map((f) => f.id)
          .sort();
        if (current.join() !== [...g.expectedCurrent].sort().join())
          throw new StaleFactPlanError();
      }
      const ids: string[] = [];
      for (const g of groups) {
        for (const ins of g.inserts) {
          const newId = id("fact");
          facts.push({
            ...ins.draft,
            id: newId,
            conflict: ins.conflict,
            supersededBy: null,
          });
          for (const old of ins.supersedes) {
            const row = facts.find((f) => f.id === old);
            if (row) row.supersededBy = newId;
          }
          ids.push(newId);
        }
        for (const flagged of g.flagConflict) {
          const row = facts.find((f) => f.id === flagged);
          if (row) row.conflict = true;
        }
      }
      return ids;
    },
  };
  return { store, objects, sources, facts };
}

export type Route = (req: {
  url: URL;
  method: string;
  headers: Headers;
  body: string;
}) => Response | Promise<Response>;

/** A fetch that routes by URL and records every request. */
export function mockFetch(route: Route) {
  const calls: {
    url: string;
    method: string;
    headers: Headers;
    body: string;
  }[] = [];
  const fetch: FetchLike = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? init.body : "";
    const call = { url, method: init?.method ?? "GET", headers, body };
    calls.push(call);
    const res = await route({ ...call, url: new URL(url) });
    // Response.url is read-only and empty for constructed responses; tests read the call log instead.
    return res;
  };
  return { fetch, calls };
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers as Record<string, string>),
    },
  });
}
