import { canonicalize, type Value } from "@cartel/contracts";
import { type FieldDef, sameValue } from "@cartel/proof-engine";
import type { FactDraft, StoredFact, SubjectKind } from "./types";

/*
 * Fact store writer (SDD §7.3, §11, T7.7). Facts are append-only:
 *
 * - A new reading supersedes the current reading from the same extractor for
 *   the same subject and field (a fresh JSON-LD read replaces the old JSON-LD
 *   read, not the Icecat one).
 * - Re-storing an identical reading from the same snapshot is a no-op.
 * - When two fresh readings of a field disagree, every one of them is flagged
 *   `conflict`. The flag is never cleared on an existing row; authority
 *   precedence is applied when the engine resolves facts, and the conflict
 *   stays on record either way.
 *
 * Planning is pure; `srv_write_facts` applies a plan atomically and rejects it
 * if the facts it was planned against have changed.
 */

export type SubjectRef = { kind: SubjectKind; id: string };

export type FactWriteInsert = {
  draft: FactDraft;
  conflict: boolean;
  supersedes: string[];
};

export type FactWriteGroup = {
  subjectKind: SubjectKind;
  subjectId: string;
  field: string;
  /** Current fact IDs the plan was computed from (optimistic concurrency). */
  expectedCurrent: string[];
  inserts: FactWriteInsert[];
  flagConflict: string[];
};

export interface FactStore {
  /** Unsuperseded facts for the subjects, optionally limited to some fields. */
  currentFacts(
    subjects: readonly SubjectRef[],
    fields?: readonly string[],
  ): Promise<StoredFact[]>;
  /** Applies a plan atomically; throws `StaleFactPlanError` when it lost a race. */
  applyFactWrites(groups: readonly FactWriteGroup[]): Promise<string[]>;
}

export class StaleFactPlanError extends Error {
  constructor() {
    super("stale_fact_plan");
    this.name = "StaleFactPlanError";
  }
}

export type PlanOptions = {
  defFor(field: string): FieldDef | undefined;
  now: Date;
};

function groupKey(f: {
  subjectKind: SubjectKind;
  subjectId: string;
  field: string;
}): string {
  return `${f.subjectKind}\u0000${f.subjectId}\u0000${f.field}`;
}

/** Usable for conflict detection: has a value, isn't unknown and hasn't gone stale. */
function isFresh(f: FactDraft, nowMs: number): boolean {
  if (f.value === null || f.state === "unknown") return false;
  return f.freshUntil === undefined || Date.parse(f.freshUntil) >= nowMs;
}

function sameReading(a: FactDraft, b: FactDraft): boolean {
  const pick = (f: FactDraft) => ({
    value: f.value,
    raw: f.raw ?? null,
    state: f.state,
    reason: f.reason ?? null,
    quote: f.quote ?? null,
    span: f.span ?? null,
    sourceId: f.sourceId,
  });
  return canonicalize(pick(a)) === canonicalize(pick(b));
}

/** Whether fresh readings hold more than one distinct value. */
function disagree(
  facts: readonly FactDraft[],
  def: FieldDef | undefined,
): boolean {
  const first = facts[0];
  if (!first || first.value === null) return false;
  return facts.some(
    (f) => f.value !== null && !sameValue(first.value as Value, f.value, def),
  );
}

/** Computes what to insert, supersede and flag. Groups with nothing to do are omitted. */
export function planFactWrites(
  current: readonly StoredFact[],
  incoming: readonly FactDraft[],
  opts: PlanOptions,
): FactWriteGroup[] {
  const nowMs = opts.now.getTime();
  const currentBy = new Map<string, StoredFact[]>();
  for (const f of current) {
    const k = groupKey(f);
    currentBy.set(k, [...(currentBy.get(k) ?? []), f]);
  }
  // The last reading per extractor wins within one batch.
  const incomingBy = new Map<string, Map<string, FactDraft>>();
  for (const f of incoming) {
    const k = groupKey(f);
    const byExtractor = incomingBy.get(k) ?? new Map<string, FactDraft>();
    byExtractor.set(f.extractor, f);
    incomingBy.set(k, byExtractor);
  }

  const groups: FactWriteGroup[] = [];
  for (const [k, byExtractor] of [...incomingBy].sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    const existing = currentBy.get(k) ?? [];
    const sample = [...byExtractor.values()][0] as FactDraft;
    const def = opts.defFor(sample.field);
    const inserts: FactWriteInsert[] = [];
    const superseded = new Set<string>();
    for (const draft of [...byExtractor.values()].sort((a, b) =>
      a.extractor < b.extractor ? -1 : 1,
    )) {
      const same = existing.filter((e) => e.extractor === draft.extractor);
      if (same.length === 1 && sameReading(same[0] as StoredFact, draft))
        continue;
      for (const e of same) superseded.add(e.id);
      inserts.push({
        draft,
        conflict: false,
        supersedes: same.map((e) => e.id).sort(),
      });
    }
    if (inserts.length === 0) continue;

    const survivors = existing.filter((e) => !superseded.has(e.id));
    const fresh = [
      ...survivors.filter((e) => isFresh(e, nowMs)),
      ...inserts.map((i) => i.draft).filter((d) => isFresh(d, nowMs)),
    ];
    const flagConflict: string[] = [];
    if (disagree(fresh, def)) {
      for (const i of inserts) if (isFresh(i.draft, nowMs)) i.conflict = true;
      for (const e of survivors)
        if (isFresh(e, nowMs) && !e.conflict) flagConflict.push(e.id);
    }
    groups.push({
      subjectKind: sample.subjectKind,
      subjectId: sample.subjectId,
      field: sample.field,
      expectedCurrent: existing.map((e) => e.id).sort(),
      inserts,
      flagConflict: flagConflict.sort(),
    });
  }
  return groups;
}

export type WriteFactsOptions = {
  defFor(field: string): FieldDef | undefined;
  now?: () => Date;
  /** Re-plans after losing a race this many times before giving up. */
  retries?: number;
};

export type WriteFactsResult = {
  insertedIds: string[];
  /** Fields now flagged as disagreeing, as `kind:subject:field`. */
  conflicts: string[];
};

/** Reads current facts, plans, and applies; re-plans if another writer got there first. */
export async function writeFacts(
  store: FactStore,
  drafts: readonly FactDraft[],
  opts: WriteFactsOptions,
): Promise<WriteFactsResult> {
  if (drafts.length === 0) return { insertedIds: [], conflicts: [] };
  const subjects = uniqueSubjects(drafts);
  const fields = [...new Set(drafts.map((d) => d.field))].sort();
  const retries = opts.retries ?? 3;
  for (let attempt = 0; ; attempt++) {
    const current = await store.currentFacts(subjects, fields);
    const groups = planFactWrites(current, drafts, {
      defFor: opts.defFor,
      now: opts.now?.() ?? new Date(),
    });
    if (groups.length === 0) return { insertedIds: [], conflicts: [] };
    try {
      const insertedIds = await store.applyFactWrites(groups);
      const conflicts = groups
        .filter(
          (g) => g.inserts.some((i) => i.conflict) || g.flagConflict.length > 0,
        )
        .map((g) => `${g.subjectKind}:${g.subjectId}:${g.field}`);
      return { insertedIds, conflicts };
    } catch (e) {
      if (!(e instanceof StaleFactPlanError) || attempt >= retries) throw e;
    }
  }
}

function uniqueSubjects(drafts: readonly FactDraft[]): SubjectRef[] {
  const seen = new Map<string, SubjectRef>();
  for (const d of drafts)
    seen.set(`${d.subjectKind}:${d.subjectId}`, {
      kind: d.subjectKind,
      id: d.subjectId,
    });
  return [...seen.values()];
}
