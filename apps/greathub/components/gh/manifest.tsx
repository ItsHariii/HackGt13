import type { LineItem, Total } from "@cartel/acp";
import Link from "next/link";
import { formatMinor } from "@/lib/money";
import {
  type OrderRow,
  type Payment,
  shortHash,
  type Verification,
} from "@/lib/orders";
import { CopyHash } from "./copy-hash";
import { Check, Cross } from "./icons";

const STATUS: Record<string, string> = {
  created: "Docked",
  confirmed: "Confirmed",
  manual_review: "Held at customs",
  shipped: "Set sail",
  fulfilled: "Delivered",
  canceled: "Canceled",
};

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

function Mark({ ok }: { ok: boolean }) {
  return (
    <span className={ok ? "gh-mark ok" : "gh-mark none"}>
      {ok ? <Check size={16} /> : <Cross size={14} />}
    </span>
  );
}

/** One order as the merchant sees it: the cargo and the evidence behind it. */
export function Manifest({
  order,
  link = false,
}: {
  order: OrderRow;
  /** Title links to the order page (used in the list). */
  link?: boolean;
}) {
  const payment = (order.payment as Payment | null) ?? {};
  const v = order.contract_verification as Verification | null;
  const lines = (order.line_items as unknown as LineItem[]) ?? [];
  const totals = ((order.totals as unknown as Total[]) ?? []).filter(
    (t) =>
      t.type !== "items_base_amount" && !(t.type === "fee" && t.amount === 0),
  );
  const paid = /author|captur|settle|paid/i.test(payment.status ?? "");
  const signed = v?.signature?.status === "verified";
  const title = `Order ${order.id}`;
  return (
    <article className="gh-manifest" aria-label={title}>
      <div className="gh-manifest-main">
        <div className="gh-manifest-head">
          <h2 className="gh-code">
            {link ? <Link href={`/orders/${order.id}`}>{title}</Link> : title}
          </h2>
          <span className={`gh-status-pill s-${order.status}`}>
            {order.status === "canceled" ? (
              <Cross size={14} />
            ) : (
              <Check size={16} />
            )}
            {STATUS[order.status] ?? order.status}
            {paid ? " · paid" : ""}
          </span>
          <span className="gh-manifest-when">
            {when(order.created_at)} UTC · buyer agent{" "}
            {v?.agent?.keyId?.startsWith("ct-agent-")
              ? "Cartel"
              : (v?.agent?.keyId ?? "unknown")}
          </span>
        </div>
        <table className="gh-cargo">
          <thead>
            <tr>
              <th scope="col">ITEM</th>
              <th scope="col">PRICE</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.item.x_cartel?.title ?? l.item.id}
                  {l.item.quantity > 1 ? ` × ${l.item.quantity}` : ""}
                  <span className="gh-code gh-cargo-sku">
                    {l.item.id} · GTIN {l.item.x_cartel?.ships_gtin}
                  </span>
                </td>
                <td className="gh-code">{formatMinor(l.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="gh-cargo-totals">
          {totals.map((t) => (
            <div
              key={t.type}
              className={t.type === "total" ? "total" : undefined}
            >
              <dt>{t.display_text}</dt>
              <dd className="gh-code">{formatMinor(t.amount)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <aside aria-label="Verification" className="gh-verify">
        <div className="gh-verify-head">
          <h3>Verification</h3>
          <span className="gh-evidence-tag">
            MERCHANT-SIDE DISPUTE EVIDENCE
          </span>
        </div>
        <div className="gh-verify-box">
          <p className="gh-verify-line">
            <Mark ok={signed} />
            {signed
              ? `Customer-signed contract v${v?.contract?.version}`
              : "Contract signature not provided"}
          </p>
          {v?.contract?.bodyHash ? (
            <CopyHash
              value={v.contract.bodyHash}
              short={shortHash(v.contract.bodyHash)}
            />
          ) : null}
        </div>
        <p className="gh-verify-box gh-verify-line">
          <Mark ok={v?.grant?.status === "verified"} />
          {v?.grant?.status === "verified"
            ? "Scoped payment grant verified"
            : "Scoped payment grant not verified"}
        </p>
        <p className="gh-verify-box gh-verify-line">
          <Mark ok={!!v?.agent} />
          {v?.agent
            ? `Agent signature verified · ${v.agent.tag ?? "no tag"}`
            : "Agent unknown"}
        </p>
        <div className="gh-verify-box">
          <span className="gh-muted-2">
            {payment.railLabel ??
              (payment.rail === "simulated"
                ? "Simulated payment"
                : "Visa Acceptance sandbox")}
          </span>
          <span className="gh-code gh-txn">
            <span className={paid ? "gh-ok" : undefined}>
              {(payment.status ?? "unknown").toUpperCase()}
            </span>
            <span>txn {payment.transactionId ?? "—"}</span>
          </span>
        </div>
      </aside>
    </article>
  );
}
