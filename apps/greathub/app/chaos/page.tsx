import type { Metadata } from "next";
import { AdminSignIn } from "@/components/admin-sign-in";
import { isAdminSession } from "@/lib/admin";
import { listProducts, type VariantView } from "@/lib/catalog";
import { MUTATIONS, SCENARIOS, type Scenario } from "@/lib/chaos";
import { returnLabel } from "@/lib/labels";
import { formatMinor } from "@/lib/money";
import { signOut } from "./actions";
import { ChaosPanel, type ScenarioView } from "./panel";

export const metadata: Metadata = { title: "Chaos Deck" };
export const dynamic = "force-dynamic";

/** What each scenario will change, told from the listing's current values. */
function scenarioView(
  s: Scenario,
  bySku: Map<string, VariantView>,
): ScenarioView {
  const lines: ScenarioView["lines"] = [];
  const subjects = new Set<string>();
  for (const step of s.steps) {
    const v = bySku.get(step.sku);
    subjects.add(v?.title ?? step.sku);
    const p = step.params ?? {};
    switch (step.mutation) {
      case "price_drop":
      case "price_raise":
      case "final_sale_flip":
        if (typeof p.priceMinor === "number")
          lines.push({
            label: "Price",
            from: v ? formatMinor(v.offer.priceMinor) : "—",
            to: formatMinor(p.priceMinor),
          });
        if (step.mutation === "final_sale_flip")
          lines.push({
            label: "Returns",
            from: v ? returnLabel(v.offer.returnPolicy.terms) : "—",
            to: "Final sale",
          });
        break;
      case "spec_edit":
        lines.push({
          label: String(p.name ?? "Spec"),
          from: v?.spec.find((x) => x.name === p.name)?.value ?? "—",
          to: String(p.value ?? "—"),
        });
        break;
      case "seller_rotation":
        lines.push({
          label: "Seller",
          from: v?.offer.seller.name ?? "—",
          to: "a marketplace seller",
        });
        break;
      case "listing_injection_text":
        lines.push({
          label: "Listing",
          from: "plain listing",
          to: "note to AI assistants",
        });
        break;
    }
  }
  return {
    id: s.id,
    label: s.label,
    story: s.story,
    subject: [...subjects].join(", "),
    ids: s.steps.map((x) => x.mutation).join(" + "),
    lines,
  };
}

export default async function ChaosPage() {
  if (!(await isAdminSession())) {
    return (
      <main className="gh-page gh-signin-page">
        <p className="gh-code gh-muted">greathub / admin / chaos</p>
        <h1 className="gh-title">The Chaos Deck</h1>
        <p className="gh-lede">
          Stir the waters in front of an audience: prices, specs, sellers,
          return terms, stock. Every catch is logged and low tide restores the
          seed.
        </p>
        <AdminSignIn next="/chaos" />
      </main>
    );
  }
  const products = await listProducts();
  const bySku = new Map(
    products.flatMap((p) => p.variants.map((v) => [v.sku, v] as const)),
  );
  const skus = products.flatMap((p) =>
    p.variants.map((v) => ({
      sku: v.sku,
      title: v.title,
      department: p.department,
    })),
  );
  const flagship = bySku.get("U2727");
  return (
    <main className="gh-page gh-deck">
      <ChaosPanel
        mutations={MUTATIONS}
        scenarios={SCENARIOS.map((s) => scenarioView(s, bySku))}
        skus={skus}
        gullTag={flagship ? formatMinor(flagship.offer.priceMinor) : "$0.00"}
        signOut={signOut}
      />
    </main>
  );
}
