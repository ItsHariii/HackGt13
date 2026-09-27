import type { LineItem, Total } from "@cartel/acp";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminSignIn } from "@/components/admin-sign-in";
import { VerificationBadges } from "@/components/verification-badges";
import { isAdminSession } from "@/lib/admin";
import { formatMinor } from "@/lib/money";
import {
  getOrder,
  NEXT_STATUSES,
  type Payment,
  type Verification,
} from "@/lib/orders";
import { setOrderStatus } from "../actions";

export const metadata: Metadata = { title: "Order" };
export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  if (!(await isAdminSession())) {
    return (
      <main className="page narrow">
        <h1 className="page-title">Order {id}</h1>
        <AdminSignIn next="/orders" />
      </main>
    );
  }
  const order = await getOrder(id);
  if (!order) notFound();
  const payment = order.payment as Payment;
  const v = order.contract_verification as Verification | null;
  const lines = (order.line_items as unknown as LineItem[]) ?? [];
  const totals = (order.totals as unknown as Total[]) ?? [];

  return (
    <main className="page wide">
      <nav aria-label="Breadcrumb" className="crumbs">
        <Link href="/orders">Orders</Link> /{" "}
        <span aria-current="page">{order.id}</span>
      </nav>
      <div className="page-head">
        <div>
          <p className="eyebrow">
            ORDER · {order.status.replace("_", " ").toUpperCase()}
          </p>
          <h1 className="page-title">{formatMinor(order.total_minor)}</h1>
        </div>
        <div className="controls">
          {(NEXT_STATUSES[order.status] ?? []).map((s) => (
            <form key={s} action={setOrderStatus.bind(null, order.id, s)}>
              <button
                type="submit"
                className={s === "canceled" ? "danger" : "ghost"}
              >
                Mark {s.replace("_", " ")}
              </button>
            </form>
          ))}
        </div>
      </div>
      <VerificationBadges v={v} />

      <section className="panel" aria-labelledby="items-title">
        <h2 id="items-title">Items</h2>
        <table className="spec">
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <th scope="row">
                  {l.item.x_cartel?.title ?? l.item.id} × {l.item.quantity}
                  <span className="fine mono">
                    {" "}
                    {l.item.id} · GTIN {l.item.x_cartel?.ships_gtin}
                  </span>
                </th>
                <td>{formatMinor(l.subtotal)}</td>
              </tr>
            ))}
            {totals
              .filter(
                (t) =>
                  t.type !== "items_base_amount" &&
                  !(t.type === "fee" && t.amount === 0),
              )
              .map((t) => (
                <tr key={t.type} className={t.type === "total" ? "total" : ""}>
                  <th scope="row">{t.display_text}</th>
                  <td>{formatMinor(t.amount)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      <section className="panel" aria-labelledby="evidence-title">
        <h2 id="evidence-title">Dispute evidence</h2>
        <dl className="facts">
          <div>
            <dt>Contract</dt>
            <dd className="mono">
              {v?.contract ? `${v.contract.id} v${v.contract.version}` : "—"}
              <br />
              {v?.contract?.bodyHash ?? ""}
            </dd>
          </div>
          <div>
            <dt>Passkey signature</dt>
            <dd>
              {v?.signature?.status === "verified"
                ? `Signature verified · credential ${v.signature.credentialId?.slice(0, 12)}… · signed ${v.signature.signedAt}`
                : "Not provided by the agent"}
            </dd>
          </div>
          <div>
            <dt>Scoped grant</dt>
            <dd className="mono">
              {v?.grant
                ? `${v.grant.id} · max ${formatMinor(v.grant.maxTotalMinor)}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Agent</dt>
            <dd className="mono">
              {v?.agent ? `${v.agent.keyId} · ${v.agent.tag ?? "no tag"}` : "—"}
            </dd>
          </div>
          <div>
            <dt>Payment</dt>
            <dd>
              {payment.railLabel}
              <br />
              <span className="mono">
                {payment.status} · transaction {payment.transactionId ?? "—"} ·
                ref {payment.reference ?? "—"}
              </span>
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
