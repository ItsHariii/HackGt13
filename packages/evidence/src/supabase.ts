import {
  type EvidenceState,
  ReasonCode,
  type Value,
} from "@proofcart/contracts";
import type { Database, Json } from "@proofcart/contracts/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unitColumns } from "./claims";
import {
  type FactStore,
  type FactWriteGroup,
  StaleFactPlanError,
  type SubjectRef,
} from "./fact-store";
import type { NewSource, SnapshotStore } from "./snapshot";
import type { FactDraft, SourceRecord, SourceType, StoredFact } from "./types";

/*
 * Supabase-backed evidence store. Server-only: it needs the secret key, which
 * is the only role allowed to write catalog tables, the `sources` bucket and
 * `srv_write_facts`.
 */

export type Db = SupabaseClient<Database>;

export const SOURCES_BUCKET = "sources";

type SourceRow = Database["public"]["Tables"]["sources"]["Row"];
type FactRow = Database["public"]["Tables"]["facts"]["Row"];

function toSource(row: SourceRow): SourceRecord {
  return {
    id: row.id,
    url: row.url,
    sourceType: row.source_type as SourceType,
    contentHash: row.content_hash,
    contentType: row.content_type,
    storagePath: row.storage_path,
    httpStatus: row.http_status,
    fetchedAt: new Date(row.fetched_at).toISOString(),
  };
}

/** `[10,20)` → `[10, 20]` (end exclusive, as Postgres canonicalizes int4range). */
export function parseSpan(span: unknown): [number, number] | undefined {
  if (typeof span !== "string") return undefined;
  const m = /^\[(\d+),(\d+)\)$/.exec(span);
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

export function factFromRow(row: FactRow): StoredFact {
  const reason = ReasonCode.safeParse(row.state_reason);
  const span = parseSpan(row.span);
  return {
    id: row.id,
    subjectKind: row.subject_kind,
    subjectId: row.subject_id,
    field: row.field,
    value: (row.value ?? null) as Value | null,
    ...(row.raw !== null ? { raw: row.raw } : {}),
    state: row.state as EvidenceState,
    ...(reason.success ? { reason: reason.data } : {}),
    sourceId: row.source_id,
    ...(row.quote !== null ? { quote: row.quote } : {}),
    ...(span ? { span } : {}),
    extractor: row.extractor,
    retrievedAt: new Date(row.retrieved_at).toISOString(),
    ...(row.fresh_until !== null
      ? { freshUntil: new Date(row.fresh_until).toISOString() }
      : {}),
    conflict: row.conflict,
  };
}

function insertJson(draft: FactDraft, conflict: boolean, supersedes: string[]) {
  const { unit, qualifier } = unitColumns(draft.value);
  return {
    value: draft.value,
    raw: draft.raw ?? null,
    unit,
    qualifier,
    state: draft.state,
    state_reason: draft.reason ?? null,
    conflict,
    source_id: draft.sourceId,
    quote: draft.quote ?? null,
    span: draft.span ?? null,
    extractor: draft.extractor,
    retrieved_at: draft.retrievedAt,
    fresh_until: draft.freshUntil ?? null,
    supersedes,
  };
}

export function writeGroupsJson(groups: readonly FactWriteGroup[]): Json {
  return groups.map((g) => ({
    subject_kind: g.subjectKind,
    subject_id: g.subjectId,
    field: g.field,
    expected_current: g.expectedCurrent,
    inserts: g.inserts.map((i) =>
      insertJson(i.draft, i.conflict, i.supersedes),
    ),
    flag_conflict: g.flagConflict,
  })) as Json;
}

export type EvidenceStore = SnapshotStore & FactStore;

export function supabaseEvidenceStore(db: Db): EvidenceStore {
  return {
    async putObject(path, bytes, contentType) {
      const { error } = await db.storage
        .from(SOURCES_BUCKET)
        .upload(path, bytes, { contentType, upsert: false });
      // Content-addressed: an existing object already holds these exact bytes.
      if (
        error &&
        !/exist|duplicate|409/i.test(
          `${error.message} ${(error as { statusCode?: string }).statusCode ?? ""}`,
        )
      ) {
        throw new Error(`snapshot upload failed: ${error.message}`);
      }
    },

    async insertSource(row: NewSource) {
      const { data, error } = await db
        .from("sources")
        .insert({
          url: row.url,
          source_type: row.sourceType,
          content_hash: row.contentHash,
          content_type: row.contentType,
          storage_path: row.storagePath,
          http_status: row.httpStatus,
          fetched_at: row.fetchedAt,
        })
        .select()
        .single();
      if (error) throw new Error(`sources insert failed: ${error.message}`);
      return toSource(data);
    },

    async findRecentSource(url, sourceType, since) {
      const { data, error } = await db
        .from("sources")
        .select()
        .eq("url", url)
        .eq("source_type", sourceType)
        .gte("fetched_at", since)
        .gte("http_status", 200)
        .lt("http_status", 300)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`sources lookup failed: ${error.message}`);
      return data ? toSource(data) : null;
    },

    async getObject(path) {
      const { data, error } = await db.storage
        .from(SOURCES_BUCKET)
        .download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },

    async currentFacts(
      subjects: readonly SubjectRef[],
      fields?: readonly string[],
    ) {
      if (subjects.length === 0) return [];
      let q = db
        .from("facts")
        .select()
        .in(
          "subject_id",
          subjects.map((s) => s.id),
        )
        .is("superseded_by", null);
      if (fields?.length) q = q.in("field", [...fields]);
      const { data, error } = await q;
      if (error) throw new Error(`facts read failed: ${error.message}`);
      const kinds = new Set(subjects.map((s) => `${s.kind}:${s.id}`));
      return data
        .filter((r) => kinds.has(`${r.subject_kind}:${r.subject_id}`))
        .map(factFromRow);
    },

    async applyFactWrites(groups) {
      const { data, error } = await db.rpc("srv_write_facts", {
        p_groups: writeGroupsJson(groups),
      });
      if (error) {
        if (error.code === "40001" || /stale_fact_plan/.test(error.message))
          throw new StaleFactPlanError();
        throw new Error(`fact write failed: ${error.message}`);
      }
      return data ?? [];
    },
  };
}

export * from "./ingest";
export * from "./refresh";
