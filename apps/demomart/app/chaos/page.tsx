import type { Metadata } from "next";
import { AdminSignIn } from "@/components/admin-sign-in";
import { isAdminSession } from "@/lib/admin";
import { listProducts } from "@/lib/catalog";
import { MUTATIONS, SCENARIOS } from "@/lib/chaos";
import { signOut } from "./actions";
import { ChaosPanel } from "./panel";

export const metadata: Metadata = { title: "Chaos Panel" };
export const dynamic = "force-dynamic";

export default async function ChaosPage() {
  if (!(await isAdminSession())) {
    return (
      <main className="page narrow">
        <p className="eyebrow">DEMO CONTROLS</p>
        <h1 className="page-title">Chaos Panel</h1>
        <p className="lede">
          Mutate this merchant in front of an audience: prices, specs, sellers,
          return terms, stock. Every change is logged and can be reset.
        </p>
        <AdminSignIn next="/chaos" />
      </main>
    );
  }
  const skus = (await listProducts()).flatMap((p) =>
    p.variants.map((v) => ({
      sku: v.sku,
      title: v.title,
      department: p.department,
    })),
  );
  return (
    <main className="page wide">
      <div className="page-head">
        <div>
          <p className="eyebrow">DEMO CONTROLS · EVERY CHANGE IS LOGGED</p>
          <h1 className="page-title">Chaos Panel</h1>
        </div>
        <form action={signOut}>
          <button type="submit" className="ghost">
            Sign out
          </button>
        </form>
      </div>
      <ChaosPanel mutations={MUTATIONS} scenarios={SCENARIOS} skus={skus} />
    </main>
  );
}
