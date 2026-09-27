import "server-only";
import { Requirement } from "@cartel/contracts";
import { catalogConnected } from "./catalog-read";
import { DEMO_KITS, type DemoKit } from "./demo-catalog";
import { createAdminClient } from "./supabase/admin";

export type KitView = DemoKit & { demo: boolean };

/** Kits from the catalog database, or the demo kits when it isn't connected. */
export async function loadKits(): Promise<KitView[]> {
  if (!catalogConnected()) return DEMO_KITS.map((k) => ({ ...k, demo: true }));
  const { data, error } = await createAdminClient()
    .from("kits")
    .select(
      "slug,title,pack,description,sort_order,kit_requirements(spec,sort_order),kit_items(role,product_id,sort_order)",
    )
    .order("sort_order");
  if (error || !data) return DEMO_KITS.map((k) => ({ ...k, demo: true }));
  return data.map((k) => ({
    slug: k.slug,
    title: k.title,
    pack: k.pack,
    description: k.description ?? "",
    requirements: [...k.kit_requirements]
      .sort((a, b) => a.sort_order - b.sort_order)
      .flatMap((r) => {
        const parsed = Requirement.safeParse(r.spec);
        return parsed.success ? [parsed.data] : [];
      }),
    items: [...k.kit_items]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({ role: i.role, productId: i.product_id })),
    demo: false,
  }));
}
