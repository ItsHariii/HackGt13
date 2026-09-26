import { extractJsonLd, fieldDef, type Pack } from "@proofcart/proof-engine";
import { claim } from "./claims";
import { type ClaimedFact, SOURCE_AUTHORITY } from "./types";

/*
 * JSON-LD extraction (SDD §11.1, T7.2). A merchant's schema.org markup is
 * structured, so no model reads it: the pack's `jsonLd` paths pick values out
 * and the deterministic unit parser reads them. What the merchant states is
 * `source_stated`; only the checkout API is authoritative for its own offer.
 */

const SCRIPT =
  /<script\b[^>]*\btype\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)[^>]*>([\s\S]*?)<\/script\s*>/gi;

/** Every parseable `<script type="application/ld+json">` block in a page. Broken blocks are skipped. */
export function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(SCRIPT)) {
    const text = (m[1] ?? "").trim().replace(/^<!--|-->$/g, "");
    if (!text) continue;
    try {
      out.push(JSON.parse(text));
    } catch {
      // Malformed markup is the merchant's problem; the field just stays unknown.
    }
  }
  return out;
}

type Node = Record<string, unknown>;

function isNode(v: unknown): v is Node {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function types(node: Node): string[] {
  const t = node["@type"];
  const list = Array.isArray(t) ? t : [t];
  return list
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.replace(/^https?:\/\/schema\.org\//, ""));
}

/** Product nodes in document order, looking through arrays and `@graph`. */
export function jsonLdProducts(blocks: readonly unknown[]): Node[] {
  const out: Node[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (!isNode(v)) return;
    if (types(v).includes("Product")) out.push(v);
    if (Array.isArray(v["@graph"])) (v["@graph"] as unknown[]).forEach(visit);
  };
  blocks.forEach(visit);
  return out;
}

export type JsonLdClaimOptions = {
  packs: readonly Pack[];
  /**
   * The product's roles. Pack fields whose first segment names a role the
   * product doesn't have are dropped, so a monitor's "Resolution" never
   * becomes a webcam fact. Omit to keep every field.
   */
  roles?: readonly string[];
};

/** Role names any of the packs define. */
function packRoleNames(packs: readonly Pack[]): Set<string> {
  return new Set(packs.flatMap((p) => p.roles.map((r) => r.role)));
}

/**
 * Whether a pack field applies to a product with these roles. Fields under a
 * role name (`monitor.*`) need that role; fields under a shared prefix
 * (`garment.*`, `offer.*`) apply to anything the pack covers.
 */
export function fieldAppliesTo(
  field: string,
  roles: readonly string[] | undefined,
  roleNames: Set<string>,
): boolean {
  if (!roles) return true;
  const head = field.split(".")[0] as string;
  return !roleNames.has(head) || roles.includes(head);
}

/** The packs whose roles include one of the product's roles. */
export function packsForRoles(
  packs: readonly Pack[],
  roles: readonly string[],
): Pack[] {
  return packs.filter((p) => p.roles.some((r) => roles.includes(r.role)));
}

/**
 * Product claims from one schema.org Product node. Each field comes from the
 * first pack that maps it; a value the parser can't read is kept as a
 * "no fact" claim with its raw text, so the evidence drawer can show it.
 */
export function jsonLdClaims(
  product: unknown,
  opts: JsonLdClaimOptions,
): ClaimedFact[] {
  const roleNames = packRoleNames(opts.packs);
  // A monitor isn't read with the apparel pack, whose `color` path would otherwise match.
  const packs = opts.roles ? packsForRoles(opts.packs, opts.roles) : opts.packs;
  const seen = new Set<string>();
  const out: ClaimedFact[] = [];
  for (const pack of packs) {
    for (const x of extractJsonLd(pack, product)) {
      if (seen.has(x.field) || !fieldAppliesTo(x.field, opts.roles, roleNames))
        continue;
      seen.add(x.field);
      out.push(
        claim(
          x.field,
          x.value,
          x.raw,
          SOURCE_AUTHORITY.json_ld,
          fieldDef(x.field, packs),
          "jsonld",
        ),
      );
    }
  }
  return out.sort((a, b) =>
    a.field < b.field ? -1 : a.field > b.field ? 1 : 0,
  );
}

/** Claims from a product page: the first Product node wins. Empty when there is none. */
export function pageClaims(
  html: string,
  opts: JsonLdClaimOptions,
): { product: Node | null; claims: ClaimedFact[] } {
  const product = jsonLdProducts(jsonLdBlocks(html))[0] ?? null;
  return { product, claims: product ? jsonLdClaims(product, opts) : [] };
}
