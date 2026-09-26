import {
  EvidenceState,
  FieldRef,
  type Importance,
  type Materiality,
  type Offer,
  type Operator,
  type Requirement,
  type RequirementScope,
  SemVer,
  UNIT_DIMENSION,
  type Value,
} from "@cartel/contracts";
import type { Resolved } from "./evidence";
import {
  AUTHORITIES,
  CORE_FIELDS,
  defaultTolerance,
  type FieldDef,
  isDuration,
} from "./fields";

/*
 * Rule packs are data plus pure functions (SDD §8.3). `definePack` checks a
 * pack when it is loaded, so a typo in a field name fails at import time,
 * not as a silent `unknown` in a user's proof report.
 */

/** Read access to one basket line's resolved facts. */
export type ItemReader = {
  readonly role: string;
  readonly offer: Offer;
  readonly qty: number;
  get(field: string): Resolved;
};

/** Read access to the whole basket. */
export type BasketReader = {
  readonly items: readonly ItemReader[];
  byRole(role: string): readonly ItemReader[];
  get(field: string): Resolved;
  /** Targets of the requirements under evaluation, e.g. the watts the laptop needs. */
  requirements: readonly Requirement[];
};

/**
 * A computed value. `from` lists the resolved inputs it actually used: the
 * result's state is their weakest, capped at `estimated` if `assumptions`
 * is non-empty (SDD §7.3).
 */
export type Derived = {
  value: Value;
  from: readonly Resolved[];
  assumptions?: readonly string[];
};

export type ItemDerive = {
  id: string;
  scope: "item";
  output: string;
  inputs: readonly string[];
  compute(item: ItemReader): Derived | null;
};

export type BasketDerive = {
  id: string;
  scope: "basket";
  output: string;
  inputs: readonly string[];
  compute(basket: BasketReader): Derived | null;
};

export type DeriveRule = ItemDerive | BasketDerive;

/**
 * A role the basket may fill. `required` is either fixed or a predicate over
 * the basket; a predicate returns the facts it relied on so the role check
 * carries their evidence state, or null when it can't tell.
 */
export type RoleRule = {
  role: string;
  label: string;
  required:
    | boolean
    | ((
        basket: BasketReader,
      ) => { required: boolean; from: readonly Resolved[] } | null);
};

/** A compatibility check between two roles, exposed as a boolean field. */
export type PairRule = {
  id: string;
  roles: readonly [string, string];
  /** The field a pair-scoped requirement names, e.g. `dock.monitor_video`. */
  field: string;
  label: string;
  evaluate(a: ItemReader, b: ItemReader): Derived | null;
};

/** A requirement the pack proposes, filled in from the user's parameters. */
export type DefaultRule = {
  ruleId: string;
  build(params: Readonly<Record<string, Value>>): DefaultRequirement | null;
};

export type DefaultRequirement = {
  scope: RequirementScope;
  role?: string;
  pairRole?: string;
  field: string;
  op: Operator;
  target: Value;
  importance: Importance;
  weight?: number;
  minStateToPass: EvidenceState;
  materiality: Materiality;
};

export type PackSpec = {
  id: string;
  version: string;
  title: string;
  /** Field definitions. A key ending in `.*` covers every field under that prefix. */
  fields: Readonly<Record<string, FieldDef>>;
  /** schema.org paths per field, tried in order (see `extractJsonLd`). */
  jsonLd?: Readonly<Record<string, readonly string[]>>;
  roles?: readonly RoleRule[];
  pairs?: readonly PairRule[];
  derive?: readonly DeriveRule[];
  defaults?: readonly DefaultRule[];
};

declare const packBrand: unique symbol;
export type Pack = Readonly<Required<PackSpec>> & {
  readonly [packBrand]: true;
};

export class PackError extends Error {
  override name = "PackError";
  constructor(
    readonly packId: string,
    readonly issues: readonly string[],
  ) {
    super(`pack ${packId} is invalid:\n- ${issues.join("\n- ")}`);
  }
}

const PACK_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const WILDCARD = /^([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*)\.\*$/;
const JSONLD_PATH =
  /^[A-Za-z@][\w@]*(?:\[[\w@]+=[^\]]+\])?(?:\.[A-Za-z@][\w@]*(?:\[[\w@]+=[^\]]+\])?)*$/;

function isFieldKey(key: string): boolean {
  return FieldRef.safeParse(key).success || WILDCARD.test(key);
}

/** Validates a pack and freezes it. Throws `PackError` listing every problem. */
export function definePack(spec: PackSpec): Pack {
  const issues: string[] = [];
  const pack = {
    jsonLd: {},
    roles: [],
    pairs: [],
    derive: [],
    defaults: [],
    ...spec,
  } as Required<PackSpec>;

  if (!PACK_ID.test(pack.id)) issues.push(`id "${pack.id}" must be kebab-case`);
  if (!SemVer.safeParse(pack.version).success)
    issues.push(`version "${pack.version}" is not semver`);

  for (const [key, def] of Object.entries(pack.fields)) {
    if (!isFieldKey(key))
      issues.push(`field "${key}" is not a dotted field path`);
    if (key in CORE_FIELDS)
      issues.push(`field "${key}" is defined by the engine`);
    issues.push(...checkFieldDef(key, def));
  }

  const known = (field: string) =>
    field in CORE_FIELDS || lookupPackField(pack, field) !== undefined;

  for (const [field, paths] of Object.entries(pack.jsonLd)) {
    if (!known(field)) issues.push(`jsonLd maps unknown field "${field}"`);
    if (paths.length === 0) issues.push(`jsonLd "${field}" has no paths`);
    for (const p of paths) {
      if (!JSONLD_PATH.test(p))
        issues.push(`jsonLd path "${p}" for "${field}" is malformed`);
    }
  }

  const roles = new Set<string>();
  for (const r of pack.roles) {
    if (!/^[a-z][a-z0-9_]*$/.test(r.role))
      issues.push(`role "${r.role}" is not a role id`);
    if (roles.has(r.role)) issues.push(`role "${r.role}" is defined twice`);
    roles.add(r.role);
  }

  const pairIds = new Set<string>();
  for (const p of pack.pairs) {
    if (pairIds.has(p.id)) issues.push(`pair "${p.id}" is defined twice`);
    pairIds.add(p.id);
    for (const role of p.roles) {
      if (!roles.has(role))
        issues.push(`pair "${p.id}" uses undeclared role "${role}"`);
    }
    if (p.roles[0] === p.roles[1])
      issues.push(`pair "${p.id}" pairs a role with itself`);
    if (!known(p.field))
      issues.push(`pair "${p.id}" field "${p.field}" is not defined`);
  }

  const outputs = new Map<string, DeriveRule>();
  for (const d of pack.derive) {
    if (outputs.has(d.output))
      issues.push(`field "${d.output}" is derived twice`);
    outputs.set(d.output, d);
    if (!known(d.output))
      issues.push(`derive "${d.id}" output "${d.output}" is not defined`);
    for (const input of d.inputs) {
      if (!known(input))
        issues.push(`derive "${d.id}" input "${input}" is not defined`);
    }
  }
  const cycle = findCycle(pack.derive);
  if (cycle) issues.push(`derive rules form a cycle: ${cycle.join(" → ")}`);

  const ruleIds = new Set<string>();
  for (const d of pack.defaults) {
    if (ruleIds.has(d.ruleId))
      issues.push(`default "${d.ruleId}" is defined twice`);
    ruleIds.add(d.ruleId);
  }

  if (issues.length > 0) throw new PackError(pack.id, issues);
  return Object.freeze(pack) as Pack;
}

function checkFieldDef(key: string, def: FieldDef): string[] {
  const out: string[] = [];
  if (!def.label) out.push(`field "${key}" needs a label`);
  for (const a of def.authority ?? []) {
    if (!(AUTHORITIES as readonly string[]).includes(a))
      out.push(`field "${key}" has unknown authority "${a}"`);
  }
  if (def.freshness !== undefined && !isDuration(def.freshness)) {
    out.push(
      `field "${key}" freshness "${def.freshness}" is not like 60s/10m/24h/30d`,
    );
  }
  if (
    def.maxState !== undefined &&
    !EvidenceState.safeParse(def.maxState).success
  ) {
    out.push(`field "${key}" maxState is not an evidence state`);
  }
  if (def.kind === "enum") {
    if (!def.values?.length) out.push(`enum field "${key}" needs values`);
    for (const [alias, target] of Object.entries(def.aliases ?? {})) {
      if (alias !== alias.toLowerCase())
        out.push(`field "${key}" alias "${alias}" must be lowercase`);
      if (!def.values?.includes(target))
        out.push(
          `field "${key}" alias "${alias}" maps to unknown value "${target}"`,
        );
    }
  }
  const dimension = (u: keyof typeof UNIT_DIMENSION) => UNIT_DIMENSION[u];
  if (def.tolerance && dimension(def.tolerance.unit) !== def.kind) {
    out.push(
      `field "${key}" tolerance unit ${def.tolerance.unit} doesn't match kind ${def.kind}`,
    );
  }
  if (def.unit && dimension(def.unit) !== def.kind) {
    out.push(`field "${key}" unit ${def.unit} doesn't match kind ${def.kind}`);
  }
  return out;
}

function findCycle(rules: readonly DeriveRule[]): string[] | null {
  const byOutput = new Map(rules.map((r) => [r.output, r]));
  const state = new Map<string, "visiting" | "done">();
  const walk = (field: string, path: string[]): string[] | null => {
    const rule = byOutput.get(field);
    if (!rule) return null;
    if (state.get(field) === "done") return null;
    if (state.get(field) === "visiting") return [...path, field];
    state.set(field, "visiting");
    for (const input of rule.inputs) {
      const found = walk(input, [...path, field]);
      if (found) return found;
    }
    state.set(field, "done");
    return null;
  };
  for (const r of rules) {
    const found = walk(r.output, []);
    if (found) return found;
  }
  return null;
}

function lookupPackField(
  pack: Pick<PackSpec, "fields">,
  field: string,
): FieldDef | undefined {
  const exact = pack.fields[field];
  if (exact) return exact;
  let best: FieldDef | undefined;
  let bestLength = -1;
  for (const [key, def] of Object.entries(pack.fields)) {
    const m = WILDCARD.exec(key);
    if (m?.[1] && field.startsWith(`${m[1]}.`) && m[1].length > bestLength) {
      best = def;
      bestLength = m[1].length;
    }
  }
  return best;
}

/**
 * The definition the engine uses for a field: the engine's own, else the
 * first pack that defines it (exact key before wildcard). Tolerance is
 * filled with the kind's default.
 */
export function fieldDef(
  field: string,
  packs: readonly Pack[],
): FieldDef | undefined {
  const def = CORE_FIELDS[field] ?? firstDefined(packs, field);
  if (!def) return undefined;
  const tolerance = defaultTolerance(def);
  return tolerance ? { ...def, tolerance } : def;
}

function firstDefined(
  packs: readonly Pack[],
  field: string,
): FieldDef | undefined {
  for (const p of packs) {
    if (p.fields[field]) return p.fields[field];
  }
  for (const p of packs) {
    const d = lookupPackField(p, field);
    if (d) return d;
  }
  return undefined;
}

/**
 * The pack's default requirements for the given parameters, stamped with
 * `pack_default` provenance. IDs are `d_<pack>_<rule>` so they are stable
 * across versions of the same requirement set.
 */
export function packDefaults(
  pack: Pack,
  params: Readonly<Record<string, Value>> = {},
): Requirement[] {
  const out: Requirement[] = [];
  for (const rule of pack.defaults) {
    const d = rule.build(params);
    if (!d) continue;
    const { minStateToPass, ...rest } = d;
    out.push({
      id: `d_${pack.id.replace(/-/g, "_")}_${rule.ruleId}`,
      ...rest,
      evidence: { minStateToPass },
      provenance: { kind: "pack_default", pack: pack.id, ruleId: rule.ruleId },
    } as Requirement);
  }
  return out;
}

/**
 * Checks requirements against the packs: every field must be defined and
 * every pair requirement must name a pair rule. Returns human-readable
 * problems; an empty list means the set is evaluable.
 */
export function checkRequirements(
  requirements: readonly Requirement[],
  packs: readonly Pack[],
): string[] {
  const issues: string[] = [];
  for (const r of requirements) {
    const def = fieldDef(r.field, packs);
    const isPairField = packs.some((p) =>
      p.pairs.some((pr) => pr.field === r.field),
    );
    if (!def && !isPairField)
      issues.push(`${r.id}: field "${r.field}" is not defined by any pack`);
    if (r.scope === "pair" && !isPairField)
      issues.push(`${r.id}: no pair rule provides "${r.field}"`);
  }
  return issues;
}
