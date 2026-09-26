import {
  type EvidenceState,
  type Importance,
  type Materiality,
  type Operator,
  Requirement,
  type Value,
} from "@cartel/contracts";
import { type FieldDef, type Pack, readAs } from "@cartel/proof-engine";
import {
  isEngineField,
  type Ontology,
  ontologyFor,
  prefixOf,
  roleSource,
} from "./ontology";
import { systemFor, untrustedBlock } from "./prompts";
import { locateQuote } from "./quote";
import type { AiRunner, RunResult, StreamRun } from "./router";
import {
  type BriefAnalysis,
  BriefAnalysisSchema,
  type Question,
  type RequirementDraft,
} from "./schemas";

/*
 * A1: brief → requirement drafts (SDD §10.1). The model proposes; this module
 * decides. A draft becomes a `Requirement` only if the ontology defines its
 * field, the deterministic parser reads its value and the whole thing passes
 * the `Requirement` schema. A draft that claims the shopper's words but
 * cannot point at them in the brief is demoted to an assumption.
 */

export type DropReason =
  | "unknown_field"
  | "subjective"
  | "pair_field"
  | "derived_field"
  | "missing_role"
  | "unknown_role"
  | "unparseable"
  | "invalid";

export type DroppedDraft = { draft: RequirementDraft; reason: DropReason };

/** Bookkeeping the engine derives from the pack's roles; not a shopper's rule. */
const DERIVED_FIELDS = new Set(["basket.missing_roles"]);

export type RequirementSet = {
  /** The pack the model matched, when it is one of the packs offered. */
  pack: string | null;
  requirements: Requirement[];
  questions: Question[];
  dropped: DroppedDraft[];
};

export type BuildOptions = {
  brief: string;
  packs: readonly Pack[];
  /** Currency for money targets written as `$900`. */
  currency?: string;
  /** Prefix for generated requirement ids; keeps ids stable per call. */
  idPrefix?: string;
};

function isRange(v: Value | null): boolean {
  return typeof v === "object" && v !== null && !Array.isArray(v) && "min" in v;
}

/**
 * The strength of evidence a requirement needs, following the pack defaults:
 * money is checked against the merchant's own checkout, dates can only ever
 * be estimates, and a preference may rest on a weaker fact.
 */
function minState(def: FieldDef, importance: Importance): EvidenceState {
  if (importance === "preference") return "estimated";
  if (def.kind === "money") return "verified";
  if (def.kind === "date") return "estimated";
  return "source_stated";
}

/** Price and total changes always matter; everything else matters on a flip. */
function materialityOf(field: string, def: FieldDef): Materiality {
  return def.kind === "money" &&
    (isEngineField(field) || field === "offer.price")
    ? "always"
    : "on_verdict_change";
}

/** `readAs`, plus bare numbers for counts ("1 store" is written `1`). */
function readTarget(
  raw: string,
  def: FieldDef,
  currency: string,
): Value | null {
  const value = readAs(raw, def, currency);
  if (value !== null || def.kind !== "count") return value;
  return /^\d+$/.test(raw.trim())
    ? { value: Number(raw.trim()), unit: "count" }
    : null;
}

function listTarget(
  raw: string,
  def: FieldDef,
  currency: string,
): Value | null {
  const parts = raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const values = parts.flatMap((p) => {
    const v = readAs(p, def, currency);
    // A list field reads each part as a one-item list.
    return Array.isArray(v) ? v : [v];
  });
  return values.every((v) => typeof v === "string")
    ? (values as string[])
    : null;
}

/** Reads the model's text target into the typed `Value` the operator needs. */
export function targetFor(
  draft: RequirementDraft,
  def: FieldDef,
  currency = "USD",
): Value | null {
  const raw = draft.value.trim();
  switch (draft.op) {
    case "exists":
      return true;
    case "in":
    case "not_in":
      return listTarget(raw, def, currency);
    case "between": {
      const value = readTarget(raw, def, currency);
      return isRange(value) ? value : null;
    }
    case "contains":
    case "excludes":
      return def.kind === "list" ? raw : readTarget(raw, def, currency);
    default:
      return readTarget(raw, def, currency);
  }
}

function scopeOf(field: string): "item" | "basket" | "merchant" | "order" {
  const prefix = prefixOf(field);
  if (prefix === "basket") return "basket";
  if (prefix === "merchant") return "merchant";
  if (prefix === "order") return "order";
  return "item";
}

function roleOf(
  draft: RequirementDraft,
  ontology: Ontology,
): { role: string } | { reason: DropReason } {
  const source = roleSource(draft.field, ontology.roles);
  if (source !== "draft") return { role: prefixOf(draft.field) };
  const role = draft.role?.trim();
  if (!role) return { reason: "missing_role" };
  if (!ontology.roles.some((r) => r.role === role)) {
    return { reason: "unknown_role" };
  }
  return { role };
}

function slug(field: string): string {
  return field.replace(/[^a-z0-9]+/gi, "_");
}

/**
 * Turns drafts into requirements. Anything the ontology or the parser cannot
 * account for is dropped and reported, never silently reinterpreted.
 */
export function buildRequirements(
  analysis: BriefAnalysis,
  options: BuildOptions,
): RequirementSet {
  const ontology = ontologyFor(options.packs);
  const currency = options.currency ?? "USD";
  const prefix = options.idPrefix ?? "a1";
  const requirements: Requirement[] = [];
  const dropped: DroppedDraft[] = [];
  const used = new Set<string>();

  for (const draft of analysis.requirements) {
    const field = draft.field.trim();
    const def = ontology.get(field);
    if (!def) {
      dropped.push({ draft, reason: "unknown_field" });
      continue;
    }
    if (def.kind === "subjective") {
      dropped.push({ draft, reason: "subjective" });
      continue;
    }
    if (ontology.pairs.some((p) => p.field === field)) {
      // Pair compatibility is the pack's job, not a shopper-written rule.
      dropped.push({ draft, reason: "pair_field" });
      continue;
    }
    if (DERIVED_FIELDS.has(field)) {
      dropped.push({ draft, reason: "derived_field" });
      continue;
    }
    const role = roleOf({ ...draft, field }, ontology);
    if ("reason" in role) {
      dropped.push({ draft, reason: role.reason });
      continue;
    }
    const target = targetFor({ ...draft, field }, def, currency);
    if (target === null) {
      dropped.push({ draft, reason: "unparseable" });
      continue;
    }

    const match = draft.quote ? locateQuote(options.brief, draft.quote) : null;
    const scope = scopeOf(field);
    let id = `${prefix}_${slug(field)}`;
    for (let n = 2; used.has(id); n++) id = `${prefix}_${slug(field)}_${n}`;
    used.add(id);

    const candidate = {
      id,
      scope,
      ...(scope === "item" ? { role: role.role } : {}),
      field,
      op: draft.op as Operator,
      target,
      importance: draft.importance,
      ...(draft.importance === "preference" && draft.weight !== null
        ? { weight: draft.weight }
        : {}),
      evidence: { minStateToPass: minState(def, draft.importance) },
      materiality: materialityOf(field, def),
      provenance: match
        ? ({
            kind: "user_stated",
            quote: match.quote,
            span: match.span,
          } as const)
        : // A claim the brief does not support is an assumption, and an
          // unconfirmed assumption can never be hard (SDD §7.2).
          ({
            kind: "ai_inferred",
            rationale: draft.rationale,
            confirmed: false,
          } as const),
    };

    const parsed = Requirement.safeParse(candidate);
    if (!parsed.success) {
      used.delete(id);
      dropped.push({ draft, reason: "invalid" });
      continue;
    }
    requirements.push(parsed.data);
  }

  const packIds = new Set(options.packs.map((p) => p.id));
  const named = analysis.pack
    ?.trim()
    .toLowerCase()
    .replace(/@.*$/, "")
    .replace(/[\s_]+/g, "-");
  const pack = named && packIds.has(named) ? named : null;
  return { pack, requirements, questions: analysis.questions, dropped };
}

export type DraftInput = {
  brief: string;
  packs: readonly Pack[];
  /** ISO date the brief was written, so "by Monday" resolves to a date. */
  today?: string;
  planId?: string | null;
  currency?: string;
  signal?: AbortSignal;
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function todayLine(today: string): string {
  const day = new Date(`${today}T00:00:00Z`).getUTCDay();
  const name = WEEKDAYS[day];
  return name ? `Today is ${name} ${today}.` : `Today is ${today}.`;
}

function promptFor(input: DraftInput): string {
  // The date sits in the prompt, not the system text, so the cached prefix
  // stays identical from day to day.
  return [
    `Packs available: ${input.packs.map((p) => p.id).join(", ") || "none"}.`,
    todayLine(input.today ?? new Date().toISOString().slice(0, 10)),
    "",
    untrustedBlock("shopper brief", input.brief),
  ].join("\n");
}

function runOptions(input: DraftInput) {
  return {
    task: "A1" as const,
    schema: BriefAnalysisSchema,
    schemaName: "brief_analysis",
    system: systemFor("A1", ontologyFor(input.packs)),
    prompt: promptFor(input),
    planId: input.planId ?? null,
    ...(input.signal ? { signal: input.signal } : {}),
  };
}

/** A1, in one call. */
export async function draftRequirements(
  router: AiRunner,
  input: DraftInput,
): Promise<RequirementSet & { call: RunResult<BriefAnalysis>["call"] }> {
  const { output, call } = await router.run(runOptions(input));
  return {
    ...buildRequirements(output, {
      brief: input.brief,
      packs: input.packs,
      ...(input.currency ? { currency: input.currency } : {}),
    }),
    call,
  };
}

export type RequirementStream = {
  /** Drafts as they arrive, already filtered through the ontology. */
  partials: AsyncIterable<RequirementSet>;
  completed: Promise<
    RequirementSet & { call: RunResult<BriefAnalysis>["call"] }
  >;
};

/** A1, streamed, so the requirements list fills in while the model writes. */
export async function streamRequirements(
  router: AiRunner,
  input: DraftInput,
): Promise<RequirementStream> {
  const stream: StreamRun<BriefAnalysis> = await router.runStream(
    runOptions(input),
  );
  const build = (analysis: BriefAnalysis) =>
    buildRequirements(analysis, {
      brief: input.brief,
      packs: input.packs,
      ...(input.currency ? { currency: input.currency } : {}),
    });

  async function* partials(): AsyncGenerator<RequirementSet> {
    for await (const partial of stream.partials) {
      yield build(readyPart(partial));
    }
  }

  return {
    partials: partials(),
    completed: stream.completed.then(({ output, call }) => ({
      ...build(output),
      call,
    })),
  };
}

/** Keeps only the drafts and questions that have arrived in full. */
function readyPart(partial: unknown): BriefAnalysis {
  const p = (partial ?? {}) as Record<string, unknown>;
  const requirements = Array.isArray(p.requirements) ? p.requirements : [];
  const questions = Array.isArray(p.questions) ? p.questions : [];
  return {
    pack: typeof p.pack === "string" ? p.pack : null,
    requirements: requirements.flatMap((r) => {
      const parsed =
        BriefAnalysisSchema.shape.requirements.element.safeParse(r);
      return parsed.success ? [parsed.data] : [];
    }),
    questions: questions.flatMap((q) => {
      const parsed = BriefAnalysisSchema.shape.questions.element.safeParse(q);
      return parsed.success ? [parsed.data] : [];
    }),
  };
}
