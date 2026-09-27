import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminSignIn } from "@/components/admin-sign-in";
import { Manifest } from "@/components/gh/manifest";
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
      <main className="gh-page gh-signin-page">
        <p className="gh-code gh-muted">greathub / admin / orders</p>
        <h1 className="gh-title">Order {id}</h1>
        <AdminSignIn next="/orders" />
      </main>
    );
  }
  const order = await getOrder(id);
  if (!order) notFound();
  const payment = (order.payment as Payment | null) ?? {};
  const v = order.contract_verification as Verification | null;
  const next = NEXT_STATUSES[order.status] ?? [];

  return (
    <main className="gh-page gh-manifests">
      <div className="gh-pagehead gh-pagehead-row">
        <div>
          <nav aria-label="Breadcrumb" className="gh-crumbs gh-code">
            <Link href="/">greathub</Link>
            <span aria-hidden="true">/</span>
            <Link href="/orders">orders</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{order.id}</span>
          </nav>
          <h1 className="gh-title">{formatMinor(order.total_minor)}</h1>
        </div>
        {next.length > 0 ? (
          <div className="gh-row-actions">
            {next.map((s) => (
              <form key={s} action={setOrderStatus.bind(null, order.id, s)}>
                <button
                  type="submit"
                  className={
                    s === "canceled"
                      ? "gh-btn gh-btn-danger"
                      : "gh-btn gh-btn-outline"
                  }
                >
                  Mark {s.replace("_", " ")}
                </button>
              </form>
            ))}
          </div>
        ) : null}
      </div>

      <Manifest order={order} />

      <section className="gh-card gh-evidence" aria-labelledby="evidence-title">
        <h2 id="evidence-title" className="gh-h3">
          Dispute evidence
        </h2>
        <dl>
          <div>
            <dt>Contract</dt>
            <dd className="gh-code">
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
            <dd className="gh-code">
              {v?.grant
                ? `${v.grant.id} · max ${formatMinor(v.grant.maxTotalMinor)}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Agent</dt>
            <dd className="gh-code">
              {v?.agent ? `${v.agent.keyId} · ${v.agent.tag ?? "no tag"}` : "—"}
            </dd>
          </div>
          <div>
            <dt>Payment</dt>
            <dd>
              {payment.railLabel}
              <br />
              <span className="gh-code">
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
