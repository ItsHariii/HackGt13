import type { Metadata } from "next";
import { OrderList } from "@/components/orders/order-list";
import { EmptyPlan } from "@/components/states/edge-states";
import { FLAGSHIP_ORDER, flagshipOrder } from "@/lib/flagship";
import { type OrderRow, storedOrders } from "@/lib/orders";

/** Reads the visitor's session and live data on every request. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Orders" };

/** Orders (TASKS T11.9): every purchase Cartel made for you. */
export default async function OrdersPage() {
  const [demo, stored] = await Promise.all([flagshipOrder(), storedOrders()]);
  const rows: OrderRow[] = [
    ...stored,
    {
      id: FLAGSHIP_ORDER,
      title: `${demo.title} · Order ${demo.id}`,
      merchant: demo.merchant,
      total: demo.total,
      status: "Paid · awaiting merchant",
      when: demo.when,
      href: `/orders/${FLAGSHIP_ORDER}`,
      demo: true,
    },
  ];
  return (
    <main className="dot-grid min-h-[70vh] text-graphite">
      <div className="mx-auto flex max-w-[960px] flex-col gap-6 px-5 py-12 sm:px-8">
        <h1 className="font-semibold font-serif text-h2 tracking-heading">
          Orders
        </h1>
        {rows.length === 0 ? <EmptyPlan /> : <OrderList orders={rows} />}
      </div>
    </main>
  );
}
