import {
  type EvidenceState,
  evidenceRank,
  type Fact,
  type ReasonCode,
  type Value,
} from "@proofcart/contracts";
import type { Authority, FieldDef } from "./fields";
import { freshnessMs } from "./fields";
import { sameValue } from "./values";

/*
 * The evidence lattice (SDD §7.3):
 *   verified > source_stated > supported > estimated > unknown
 * Derived facts take the weakest input; an assumption caps at `estimated`;
 * conflicts resolve only by the pack's authority precedence; stale facts
 * drop to `unknown`.
 */

export function atLeast(state: EvidenceState, floor: EvidenceState): boolean {
  return evidenceRank(state) >= evidenceRank(floor);
}

/** The weakest of the states (the lattice meet). `verified` for none. */
export function weakest(states: Iterable<EvidenceState>): EvidenceState {
  let out: EvidenceState = "verified";
  for (const s of states) if (evidenceRank(s) < evidenceRank(out)) out = s;
  return out;
}

/** The strongest of the states (the lattice join). `unknown` for none. */
export function strongest(states: Iterable<EvidenceState>): EvidenceState {
  let out: EvidenceState = "unknown";
  for (const s of states) if (evidenceRank(s) > evidenceRank(out)) out = s;
  return out;
}

/** Lowers `state` to `cap` if it is stronger; never raises it. */
export function capState(
  state: EvidenceState,
  cap: EvidenceState | undefined,
): EvidenceState {
  return cap !== undefined && evidenceRank(state) > evidenceRank(cap)
    ? cap
    : state;
}

/**
 * State of a derived fact: the weakest input, capped at `estimated` when the
 * derivation relied on an assumption (SDD §22.1 invariant 9).
 */
export function derivedState(
  inputs: readonly EvidenceState[],
  usesAssumption: boolean,
): EvidenceState {
  const base = inputs.length === 0 ? "unknown" : weakest(inputs);
  return usesAssumption ? capState(base, "estimated") : base;
}

/** What the engine knows about one field of one subject after resolution. */
export type Resolved = {
  value: Value | null;
  state: EvidenceState;
  /** Why the state is `unknown`; null otherwise. */
  reason: ReasonCode | null;
  /** Sources disagreed, even if authority precedence settled it. */
  conflict: boolean;
  factIds: string[];
  /** Set when the value was computed rather than read. */
  derivation?: { rule: string; assumptions: string[] };
};

export function unknownResolved(
  reason: ReasonCode,
  factIds: readonly string[] = [],
  value: Value | null = null,
  conflict = false,
): Resolved {
  return {
    value,
    state: "unknown",
    reason,
    conflict,
    factIds: sortedUnique(factIds),
  };
}

export function sortedUnique(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort();
}

export type SourceInfo = { authority: Authority; name?: string };

export type ResolveContext = {
  nowMs: number;
  sources: Readonly<Record<string, SourceInfo>>;
};

type Effective = {
  fact: Fact;
  state: EvidenceState;
  reason: ReasonCode | null;
};

/** Applies freshness, the field's `maxState` and qualifier caps to one fact. */
export function effectiveFact(
  fact: Fact,
  def: FieldDef | undefined,
  ctx: ResolveContext,
): Effective {
  if (fact.state === "unknown" || fact.value === null) {
    return { fact, state: "unknown", reason: fact.reason ?? "no_fact" };
  }
  const freshUntil = fact.freshUntil
    ? Date.parse(fact.freshUntil)
    : def?.freshness
      ? Date.parse(fact.retrievedAt) + freshnessMs(def.freshness)
      : Number.POSITIVE_INFINITY;
  if (ctx.nowMs > freshUntil)
    return { fact, state: "unknown", reason: "stale" };
  let state = capState(fact.state, def?.maxState);
  const v = fact.value;
  if (
    typeof v === "object" &&
    !Array.isArray(v) &&
    "qualifier" in v &&
    v.qualifier
  ) {
    state = capState(
      state,
      (def?.qualifierCap ?? DEFAULT_QUALIFIER_CAP)[v.qualifier],
    );
  }
  return { fact, state, reason: null };
}

/** "approx." values are estimates unless the pack says otherwise. */
const DEFAULT_QUALIFIER_CAP: NonNullable<FieldDef["qualifierCap"]> = {
  approx: "estimated",
};

/** Precedence of unknown reasons when no fact is usable: most informative first. */
const UNKNOWN_PRIORITY: readonly ReasonCode[] = [
  "conflict",
  "stale",
  "subjective",
  "insufficient_evidence",
  "no_fact",
];

/**
 * Resolves every fact about one field of one subject into a single value
 * and state. Input order never matters: facts are sorted by ID first.
 */
export function resolveFacts(
  facts: readonly Fact[],
  def: FieldDef | undefined,
  ctx: ResolveContext,
): Resolved {
  const ids = facts.map((f) => f.id);
  if (def?.kind === "subjective") return unknownResolved("subjective", ids);
  if (facts.length === 0) return unknownResolved("no_fact");

  const all = [...facts]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((f) => effectiveFact(f, def, ctx));
  const usable = all.filter((e) => e.state !== "unknown");
  const flagged = facts.some((f) => f.conflict);

  if (usable.length === 0) {
    const reason =
      UNKNOWN_PRIORITY.find((r) => all.some((e) => e.reason === r)) ??
      "no_fact";
    // Keep a stale reading visible so the UI can say what it used to be.
    const shown =
      all.find((e) => e.reason === reason && e.fact.value !== null)?.fact
        .value ?? null;
    return unknownResolved(
      reason,
      ids,
      shown,
      flagged || reason === "conflict",
    );
  }

  const groups = groupByValue(usable, def);
  if (groups.length === 1) return fromGroup(groups[0] as Effective[], flagged);

  // Sources disagree: only the pack's authority order may settle it.
  for (const authority of def?.authority ?? []) {
    const byAuthority = groups.filter((g) =>
      g.some((e) => ctx.sources[e.fact.sourceId]?.authority === authority),
    );
    if (byAuthority.length === 1) {
      const group = (byAuthority[0] as Effective[]).filter(
        (e) => ctx.sources[e.fact.sourceId]?.authority === authority,
      );
      return { ...fromGroup(group, true), factIds: sortedUnique(ids) };
    }
    if (byAuthority.length > 1) break;
  }
  return unknownResolved("conflict", ids, null, true);
}

function groupByValue(
  items: readonly Effective[],
  def: FieldDef | undefined,
): Effective[][] {
  const groups: Effective[][] = [];
  for (const e of items) {
    const g = groups.find((grp) =>
      sameValue(
        (grp[0] as Effective).fact.value as Value,
        e.fact.value as Value,
        def,
      ),
    );
    if (g) g.push(e);
    else groups.push([e]);
  }
  return groups;
}

function fromGroup(group: readonly Effective[], conflict: boolean): Resolved {
  const state = strongest(group.map((e) => e.state));
  // Show the strongest claim's wording; ties go to the lowest fact ID.
  const lead = group.find((e) => e.state === state) as Effective;
  return {
    value: lead.fact.value,
    state,
    reason: null,
    conflict: conflict || group.some((e) => e.fact.conflict),
    factIds: sortedUnique(group.map((e) => e.fact.id)),
  };
}
