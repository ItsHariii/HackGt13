import "server-only";
import { findProduct } from "./catalog-read";
import { DEMO_NOW } from "./demo-catalog";
import { ALL_PACKS } from "./evidence";
import type { KitView } from "./kits";
import { productCard, productView } from "./product-view";

/** A kit's starter products with their verdicts against the kit's rules. */
export async function kitProducts(kit: KitView) {
  const found = await Promise.all(
    kit.items.map((i) => findProduct(i.productId)),
  );
  return found.flatMap((f, i) => {
    if (f.status !== "ok") return [];
    const now = f.demo ? DEMO_NOW : new Date().toISOString();
    const view = productView(f.product, kit.requirements, ALL_PACKS, now);
    return [
      {
        role: kit.items[i]?.role ?? "",
        card: productCard(f.product, ALL_PACKS, now),
        view,
        passes:
          view.checks.length > 0 &&
          view.checks.every(
            (c) => c.status === "pass" || c.status === "estimate",
          ),
        fails: view.checks.filter((c) => c.status === "fail").length,
      },
    ];
  });
}
