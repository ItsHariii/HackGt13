import Link from "next/link";
import { DemoNote } from "@/components/plan/plan-header";
import type { OrderRow } from "@/lib/orders";

/** Orders, newest first, each opening its receipt. */
export function OrderList({ orders }: { orders: OrderRow[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {orders.map((o) => (
        <li key={o.id}>
          <Link
            href={o.href}
            className="sheet flex flex-wrap items-center gap-x-6 gap-y-1 p-4 hover:border-graphite"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-2 font-semibold text-ui">
                {o.title}
                {o.demo && <DemoNote />}
              </span>
              <span className="text-muted text-small">
                {o.merchant} · {o.when}
              </span>
            </span>
            <span className="text-small">{o.status}</span>
            <span className="num font-semibold text-[18px] text-ink">
              {o.total}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
