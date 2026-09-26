import {
  canonicalize,
  type Operator,
  Requirement,
  type Value,
} from "@proofcart/contracts";
import { fieldAppliesTo, packsForRoles } from "@proofcart/evidence";
import { fieldDef, type Pack, resolveFacts } from "@proofcart/proof-engine";
import { type CatalogProduct, sourceInfo } from "./product";

export type Facet = {
  field: string;
  label: string;
  kind: string;
  roles: string[];
  values: { value: Value; count: number }[];
};

/** Counts describe this result set, one count per product, never raw attribute guesses. */
export function buildFacets(
  products: readonly CatalogProduct[],
  packs: readonly Pack[],
  now: string,
): Facet[] {
  const roles = [...new Set(products.flatMap((p) => p.roles))];
  const selected = packsForRoles(packs, roles);
  const roleNames = new Set(packs.flatMap((p) => p.roles.map((r) => r.role)));
  const fields = new Set(
    selected
      .flatMap((p) => [
        ...Object.keys(p.fields),
        ...products
          .flatMap((product) => product.facts.map((f) => f.field))
          .filter((f) => fieldDef(f, [p])),
      ])
      .filter(
        (f) =>
          !f.endsWith(".*") &&
          !/^(basket|merchant|order|offer)\./.test(f) &&
          fieldAppliesTo(f, roles, roleNames) &&
          !selected.some((p) => p.pairs.some((pair) => pair.field === f)),
      ),
  );
  return [...fields].sort().flatMap((field) => {
    const def = fieldDef(field, selected);
    if (!def || def.kind === "subjective") return [];
    const counts = new Map<string, { value: Value; count: number }>();
    for (const product of products) {
      if (!fieldAppliesTo(field, product.roles, roleNames)) continue;
      const values = new Map<string, Value>();
      const offers = product.offers.filter((o) => !o.referenceOnly);
      for (const offer of offers.length ? offers : [null]) {
        const claims = product.facts.filter(
          (f) =>
            f.field === field &&
            ((f.subjectKind === "product" && f.subjectId === product.id) ||
              (f.subjectKind === "offer" && f.subjectId === offer?.id)),
        );
        const row = resolveFacts(claims, def, {
          nowMs: Date.parse(now),
          sources: sourceInfo(product.sources),
        });
        if (row.state === "unknown" || row.conflict || row.value === null)
          continue;
        for (const value of Array.isArray(row.value) ? row.value : [row.value])
          values.set(canonicalize(value), value);
      }
      for (const [key, value] of values)
        counts.set(key, { value, count: (counts.get(key)?.count ?? 0) + 1 });
    }
    return [
      {
        field,
        label: def.label,
        kind: def.kind,
        roles: roles.filter((r) => fieldAppliesTo(field, [r], roleNames)),
        values: [...counts.values()].sort((a, b) =>
          canonicalize(a.value).localeCompare(canonicalize(b.value)),
        ),
      },
    ];
  });
}

/** Promotion is explicit user intent. Role is required because garment fields span several roles. */
export function promoteToRule(
  field: string,
  op: Operator,
  value: Value,
  via: "facet",
  context: { role: string; packs: readonly Pack[]; id?: string },
): Requirement {
  const def = fieldDef(field, packsForRoles(context.packs, [context.role]));
  const roleNames = new Set(
    context.packs.flatMap((p) => p.roles.map((r) => r.role)),
  );
  if (
    !roleNames.has(context.role) ||
    !def ||
    def.kind === "subjective" ||
    /^(basket|merchant|order)\./.test(field) ||
    context.packs.some((p) => p.pairs.some((pair) => pair.field === field)) ||
    !fieldAppliesTo(field, [context.role], roleNames)
  )
    throw new Error("field is not a facet for this role");
  return Requirement.parse({
    id: context.id ?? `facet_${crypto.randomUUID().replaceAll("-", "")}`,
    scope: "item",
    role: context.role,
    field,
    op,
    target: value,
    importance: "hard",
    evidence: { minStateToPass: "source_stated" },
    materiality: "on_verdict_change",
    provenance: { kind: "user_selected", via, label: def.label },
  });
}
