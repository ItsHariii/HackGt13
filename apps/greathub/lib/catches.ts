/*
 * A "catch" is one row of the mutation log, told in GreatHub's harbor
 * voice (Style Tile vocabulary: Commit → Catch, Reset --hard → Reset to low
 * tide). The joke stays in the verb and the author; the change itself is
 * spelled out plainly, with exact prices and values.
 */

export interface CatchEntry {
  id: number;
  mutation: string;
  scenario: string | null;
  target: { sku?: string; params?: Record<string, unknown> };
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actor: string;
  created_at: string;
}

const VERB: Record<string, string> = {
  price_drop: "force-ship",
  price_raise: "haul up",
  spec_edit: "scribble",
  variant_swap: "swap",
  seller_rotation: "rotate crew",
  final_sale_flip: "flip",
  return_fee_added: "toll",
  return_window_shortened: "shorten",
  shipping_fee_added: "toll",
  delivery_slip: "delay",
  out_of_stock: "empty the hold",
  pack_size_shrink: "shrink",
  subscription_added: "hook",
  listing_injection_text: "plant",
  jsonld_conflict: "smudge",
  recall_posted: "flag",
  reset: "reset",
};

const FIELD_LABELS: Record<string, string> = {
  price_minor: "price",
  seller_id: "seller",
  availability: "availability",
  stock: "stock",
  final_sale: "final sale",
  return_policy_id: "returns",
  pack_size: "pack size",
  shipping_fee_minor: "surcharge",
  ships_sku: "ships as",
  injection_text: "seller note",
  delivery_max_days: "latest delivery (days)",
};

type Spec = { name: string; value: string }[];

function money(minor: unknown) {
  return typeof minor === "number"
    ? `$${(minor / 100).toFixed(2)}`
    : String(minor);
}

/** A readable list of what a mutation changed. */
export function describeCatch(entry: CatchEntry): string[] {
  const b = entry.before ?? {};
  const a = entry.after ?? {};
  const out: string[] = [];
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    if (JSON.stringify(b[key]) === JSON.stringify(a[key])) continue;
    const fmt = key.endsWith("_minor")
      ? money
      : (v: unknown) => (v === null || v === undefined ? "—" : String(v));
    out.push(`${label} ${fmt(b[key])} → ${fmt(a[key])}`);
  }
  for (const specKey of ["spec", "jsonld_spec"] as const) {
    const before = (b[specKey] as Spec | null) ?? [];
    const after = (a[specKey] as Spec | null) ?? [];
    for (const s of after) {
      const prev =
        before.find((x) => x.name === s.name) ??
        (specKey === "jsonld_spec" && !b.jsonld_spec
          ? ((b.spec as Spec) ?? []).find((x) => x.name === s.name)
          : undefined);
      if (!prev || prev.value !== s.value) {
        out.push(
          `${specKey === "spec" ? "" : "JSON-LD "}${s.name}: ${prev?.value ?? "—"} → ${s.value}`,
        );
      }
    }
  }
  if (JSON.stringify(b.subscription) !== JSON.stringify(a.subscription))
    out.push("now a subscription");
  if (JSON.stringify(b.recalls) !== JSON.stringify(a.recalls))
    out.push("recall posted (Mock CPSC)");
  return out;
}

/** "force-ship: price_drop U2727 price $329.00 → $319.00" */
export function catchMessage(entry: CatchEntry): string {
  if (entry.mutation === "reset") return "reset: low tide, seed data restored";
  const verb = VERB[entry.mutation] ?? "stir";
  const change = describeCatch(entry).join(" · ") || "no visible change";
  const sku = entry.target.sku ? ` ${entry.target.sku}` : "";
  return `${verb}: ${entry.mutation}${sku} ${change}`;
}

/** Who made the catch: the Gull stirs the water, the Captain resets it. */
export function catchAuthor(entry: Pick<CatchEntry, "mutation">): string {
  return entry.mutation === "reset" ? "captain-inkwell" : "the-gull";
}

/** A stable seven-character tag for a log row, shown like a short hash. */
export function catchHash(id: number): string {
  return (Math.imul(id, 2654435761) >>> 0)
    .toString(16)
    .padStart(8, "0")
    .slice(0, 7);
}

/** "just now", "12 s ago", "6 min ago", "3 h ago", "2 d ago". */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
}
