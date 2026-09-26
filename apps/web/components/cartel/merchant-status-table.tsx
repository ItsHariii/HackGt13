import { StatusMark } from "@/components/paper/status-mark";
import type { Status } from "@/lib/status";
import { type CheckoutTier, CheckoutTierBadge } from "./checkout-tier-badge";

export type MerchantStatus = {
  merchant: string;
  items: number;
  tier: CheckoutTier;
  status: Status;
  statusLabel: string;
  total: string;
};

/**
 * One row per merchant in a multi-merchant plan. Orders are separate, so
 * partial states are shown as they are (SDD §2 non-goals).
 */
export function MerchantStatusTable({
  rows,
  caption = "Merchants",
}: {
  rows: MerchantStatus[];
  caption?: string | undefined;
}) {
  return (
    <table className="sheet-formal w-full border-collapse text-left text-small text-graphite">
      <caption className="pb-2 text-left font-semibold font-serif text-h4">
        {caption}
      </caption>
      <thead className="text-meta text-muted uppercase tracking-label">
        <tr className="border-rule border-b">
          <th scope="col" className="px-3 py-2 font-semibold">
            Merchant
          </th>
          <th scope="col" className="px-3 py-2 font-semibold">
            Items
          </th>
          <th scope="col" className="px-3 py-2 font-semibold">
            Checkout
          </th>
          <th scope="col" className="px-3 py-2 font-semibold">
            Status
          </th>
          <th scope="col" className="px-3 py-2 text-right font-semibold">
            Total
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.merchant}
            className="border-rule-soft border-b last:border-0"
          >
            <th scope="row" className="px-3 py-2.5 font-semibold">
              {r.merchant}
            </th>
            <td className="num px-3 py-2.5">{r.items}</td>
            <td className="px-3 py-2.5">
              <CheckoutTierBadge tier={r.tier} />
            </td>
            <td className="px-3 py-2.5">
              <StatusMark status={r.status} label={r.statusLabel} />
            </td>
            <td className="num px-3 py-2.5 text-right">{r.total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
