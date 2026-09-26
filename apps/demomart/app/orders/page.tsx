import type { Metadata } from "next";
import Link from "next/link";
import { AdminSignIn } from "@/components/admin-sign-in";
import { VerificationBadges } from "@/components/verification-badges";
import { isAdminSession } from "@/lib/admin";
import { formatMinor } from "@/lib/money";
import { listOrders, type Payment, type Verification } from "@/lib/orders";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  if (!(await isAdminSession())) {
    return (
      <main className="page narrow">
        <p className="eyebrow">MERCHANT VIEW</p>
        <h1 className="page-title">Orders</h1>
        <AdminSignIn next="/orders" />
      </main>
    );
  }
  const orders = await listOrders();
  return (
    <main className="page wide">
      <p className="eyebrow">MERCHANT VIEW</p>
      <h1 className="page-title">Orders</h1>
      <p className="lede">
        Each order records what DemoMart checked before charging: the agent's
        signature, ProofCart's scoped grant, and the customer's passkey
        signature over the exact contract.
      </p>
      {orders.length === 0 ? (
        <p className="empty-card">
          No orders yet. ProofCart creates them through the ACP checkout.
        </p>
      ) : (
        <ul className="orders">
          {orders.map((o) => {
            const payment = o.payment as Payment;
            return (
              <li key={o.id}>
                <div className="order-top">
                  <Link href={`/orders/${o.id}`} className="mono">
                    {o.id}
                  </Link>
                  <span className={`status-pill s-${o.status}`}>
                    {o.status.replace("_", " ")}
                  </span>
                  <strong>{formatMinor(o.total_minor)}</strong>
                </div>
                <p className="fine">
                  {new Date(o.created_at).toLocaleString("en-US", {
                    timeZone: "UTC",
                  })}{" "}
                  UTC ·{" "}
                  {payment.rail === "simulated"
                    ? "Simulated payment"
                    : "Visa Acceptance sandbox"}{" "}
                  · transaction{" "}
                  <span className="mono">{payment.transactionId ?? "—"}</span>
                </p>
                <VerificationBadges
                  v={o.contract_verification as Verification | null}
                />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
