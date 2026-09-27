import type { Metadata } from "next";
import { AdminSignIn } from "@/components/admin-sign-in";
import { GHFigure } from "@/components/gh/figure";
import { Manifest } from "@/components/gh/manifest";
import { isAdminSession } from "@/lib/admin";
import { listOrders } from "@/lib/orders";

export const metadata: Metadata = { title: "Cargo Manifest" };
export const dynamic = "force-dynamic";

function Head() {
  return (
    <div className="gh-pagehead">
      <p className="gh-code gh-muted">greathub / admin / orders</p>
      <h1 className="gh-title">Cargo Manifest</h1>
      <p className="gh-quip">
        I&apos;ll gladly pay you Tuesday… just kidding. Authorized today.
      </p>
    </div>
  );
}

export default async function OrdersPage() {
  if (!(await isAdminSession())) {
    return (
      <main className="gh-page gh-signin-page">
        <Head />
        <AdminSignIn next="/orders" />
      </main>
    );
  }
  const orders = await listOrders();
  return (
    <main className="gh-page gh-manifests">
      <Head />
      {orders.length === 0 ? (
        <div className="gh-empty-hold">
          <GHFigure pose="net" className="gh-empty-figure" />
          <p className="gh-empty-title">No cargo yet. The hold is hungry.</p>
          <p>Orders from signed agents appear here as they dock.</p>
        </div>
      ) : (
        <ol className="gh-manifest-list">
          {orders.map((o) => (
            <li key={o.id}>
              <Manifest order={o} link />
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
