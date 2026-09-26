import { CORE_FIELDS, type FieldDef, type Pack } from "@proofcart/proof-engine";

/*
 * The field list the model is allowed to name. It is rendered once per pack
 * set, in a fixed order, and always sits at the front of the prompt so
 * OpenAI's automatic prompt caching can reuse it (SDD §10.1).
 *
 * A field the ontology doesn't list cannot become a requirement or a fact:
 * `@proofcart/ai` drops it and records the drop.
 */

export type OntologyEntry = {
  field: string;
  def: FieldDef;
  /** The role prefix an item-scoped requirement uses: `monitor.usb_c_pd_watts`. */
  role: string;
};

export type Ontology = {
  /** `home-office@1.0.0`, joined for the cache key and the prompt header. */
  packs: readonly string[];
  entries: readonly OntologyEntry[];
  roles: readonly { role: string; label: string; required: boolean }[];
  pairs: readonly { field: string; label: string; roles: readonly string[] }[];
  text: string;
  get(field: string): FieldDef | undefined;
};

/** Scope-carrying prefixes the engine owns; everything else names a role. */
const ENGINE_PREFIXES = new Set(["offer", "basket", "merchant", "order"]);

export function prefixOf(field: string): string {
  return field.split(".")[0] ?? "";
}

/** True for the fields the engine computes, which name a scope, not a role. */
export function isEngineField(field: string): boolean {
  return ENGINE_PREFIXES.has(prefixOf(field));
}

/**
 * How an item-scoped requirement on `field` gets its role: from the field
 * prefix (`monitor.diagonal`), from the draft (`offer.price`, and
 * `garment.color`, which any apparel role can carry), or not at all for
 * basket, merchant and order fields.
 */
export function roleSource(
  field: string,
  roles: readonly { role: string }[],
): "prefix" | "draft" | "none" {
  const prefix = prefixOf(field);
  if (prefix === "offer") return "draft";
  if (ENGINE_PREFIXES.has(prefix)) return "none";
  return roles.some((r) => r.role === prefix) ? "prefix" : "draft";
}

function describe(field: string, def: FieldDef): string {
  const parts = [`${field} (${def.kind}`];
  if (def.unit) parts.push(`, in ${def.unit}`);
  parts.push(")");
  const head = `${parts.join("")} — ${def.label}`;
  if (def.kind === "enum" && def.values?.length) {
    return `${head}; one of: ${[...def.values].sort().join(", ")}`;
  }
  if (def.kind === "subjective") {
    return `${head}; subjective: never a requirement, never a fact`;
  }
  return head;
}

const OPERATORS = [
  "eq (equals)",
  "neq (not equal)",
  "gte (at least)",
  "lte (at most)",
  "between (inclusive range, value written as `min-max`)",
  "in (one of a list)",
  "not_in (none of a list)",
  "contains (list contains)",
  "excludes (list does not contain)",
  "before (date is earlier than)",
  "compatible_with (pair rule)",
  "exists (a value is stated at all)",
].join("\n  ");

/**
 * Builds the ontology for a pack set. Packs are read in the order given; the
 * first definition of a field wins, which matches `fieldDef`.
 */
export function buildOntology(packs: readonly Pack[]): Ontology {
  const defs = new Map<string, FieldDef>();
  for (const [field, def] of Object.entries(CORE_FIELDS)) defs.set(field, def);
  for (const pack of packs) {
    for (const [field, def] of Object.entries(pack.fields)) {
      // `role.*` wildcards describe families of fields and cannot be named.
      if (field.endsWith(".*")) continue;
      if (!defs.has(field)) defs.set(field, def);
    }
  }

  const entries: OntologyEntry[] = [...defs.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([field, def]) => ({ field, def, role: prefixOf(field) }));

  const roles = packs
    .flatMap((p) => p.roles)
    .map((r) => ({
      role: r.role,
      label: r.label,
      required: r.required === true,
    }));

  const pairs = packs
    .flatMap((p) => p.pairs)
    .map((p) => ({ field: p.field, label: p.label, roles: [...p.roles] }));

  const packIds = packs.map((p) => `${p.id}@${p.version}`);
  const text = [
    `Rule packs: ${packIds.join(", ") || "none"}.`,
    "",
    "Roles a basket can fill:",
    ...roles.map(
      (r) => `  ${r.role} — ${r.label}${r.required ? " (required)" : ""}`,
    ),
    "",
    "Fields. A field name is `<role>.<name>` for item fields and",
    "`offer|basket|merchant|order.<name>` for the ones the engine computes.",
    "Use these exact names; anything else is discarded. A field whose prefix",
    "is not one of the roles above (`offer.*`, and shared prefixes such as",
    "`garment.*`) needs `role` set to the item it is about.",
    ...entries.map((e) => `  ${describe(e.field, e.def)}`),
    ...(pairs.length > 0
      ? [
          "",
          "Pair fields (a compatibility check between two roles):",
          ...pairs.map(
            (p) => `  ${p.field} — ${p.label} (${p.roles.join(" ↔ ")})`,
          ),
        ]
      : []),
    "",
    `Operators:\n  ${OPERATORS}`,
  ].join("\n");

  return {
    packs: packIds,
    entries,
    roles,
    pairs,
    text,
    get: (field) => defs.get(field),
  };
}

const cache = new WeakMap<readonly Pack[], Ontology>();

/** Caches by pack array identity so a request rebuilds nothing. */
export function ontologyFor(packs: readonly Pack[]): Ontology {
  const hit = cache.get(packs);
  if (hit) return hit;
  const built = buildOntology(packs);
  cache.set(packs, built);
  return built;
}
