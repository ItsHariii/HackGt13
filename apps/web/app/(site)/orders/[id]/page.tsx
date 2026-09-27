import { Download, FileWarning } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { GuardStepper } from "@/components/cartel/guard-stepper";
import { HighFive } from "@/components/doodle/moments";
import { DeliveryCheck } from "@/components/orders/delivery-check";
import { Receipt } from "@/components/orders/receipt";
import { DemoNote } from "@/components/plan/plan-header";
import { Button } from "@/components/ui/button";
import { UUID } from "@/lib/catalog";
import {
  FLAGSHIP_ORDER,
  flagshipOrder,
  flagshipStory,
  type OrderView,
} from "@/lib/flagship";
import { storedOrderDelivery, storedReceipt } from "@/lib/orders";

export const metadata: Metadata = { title: "Order" };

/** The receipt, what was checked, and what to do next: one layout for every order. */
function OrderSummary({
  orderId,
  order,
  demo,
  celebrate,
  delivery,
}: {
  /** The id in Cartel's URLs (the stored row, or the flagship demo id). */
  orderId: string;
  order: OrderView;
  demo: boolean;
  celebrate: boolean;
  delivery: ReactNode;
}) {
  return (
    <main className="dot-grid text-graphite">
      <div className="mx-auto grid max-w-[1440px] gap-[72px] px-5 pb-16 sm:px-10 lg:grid-cols-[520px_minmax(0,1fr)] xl:px-[120px]">
        <Receipt order={order} />
        <div className="flex min-w-0 flex-col gap-9 pt-10 lg:pt-[72px]">
          {celebrate && <HighFive h={150} />}
          <p className="flex flex-wrap items-center gap-2 font-semibold text-meta text-muted uppercase tracking-label">
            {order.title} · Order {order.id} {demo && <DemoNote />}
          </p>
          <div className="-mt-6 flex flex-col gap-2.5">
            <h1 className="font-semibold font-serif text-[38px] leading-[1.05] tracking-[-0.03em] sm:text-[48px]">
              Paid. Exactly what you approved.
            </h1>
            <p className="max-w-[560px] text-[18px] text-graphite-2 leading-normal">
              Contract v{order.contractVersion} was re-checked against the live
              checkout at {order.when}. Every hard rule passed, so the payment
              went through.
            </p>
          </div>
          <dl className="grid max-w-[620px] grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-rule border-y py-4 text-ui">
            <dt className="text-muted">Store</dt>
            <dd>{order.merchant}</dd>
            <dt className="text-muted">Items</dt>
            <dd>{order.lines.length}</dd>
            <dt className="text-muted">Charged</dt>
            <dd className="num font-semibold">{order.total}</dd>
            <dt className="text-muted">Paid with</dt>
            <dd>{order.processor}</dd>
            <dt className="text-muted">Proof</dt>
            <dd>{order.proof}</dd>
          </dl>
          <div className="max-w-[620px]">
            <GuardStepper steps={order.steps} label="Order status" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <a href={`/orders/${orderId}/evidence-pack`} download>
                <Download size={16} aria-hidden="true" /> Download Evidence Pack
              </a>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/orders/${orderId}/dispute`}>
                <FileWarning size={16} aria-hidden="true" /> Dispute packet
              </Link>
            </Button>
          </div>
          <p className="text-muted text-small">
            The Evidence Pack holds the signed contract, the proof report, the
            source snapshots and the ledger, with a{" "}
            <code className="font-mono">verify.mjs</code> that re-checks them
            offline: unzip it and run{" "}
            <code className="font-mono">node verify.mjs</code>.
          </p>
          {delivery}
          <p className="flex max-w-[620px] items-center gap-2.5 border-rule border-t pt-[18px] text-[13.5px] text-graphite-2">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
              className="shrink-0"
            >
              <path d="M8 1.5l5.5 2v4c0 3.3-2.4 5.9-5.5 7-3.1-1.1-5.5-3.7-5.5-7v-4z" />
              <path
                d="M5.5 8l1.8 1.8L10.8 6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Verified agent Cartel (RFC 9421) · Customer-signed contract verified
            by the merchant
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-small">
            <Link
              href={`/ledger/${order.planId}`}
              className="text-ink underline underline-offset-4"
            >
              Ledger
            </Link>
            <Link
              href={`/plans/${order.planId}/contract`}
              className="text-ink underline underline-offset-4"
            >
              Contract v{order.contractVersion}
            </Link>
            <Link
              href={`/plans/${order.planId}/checkout`}
              className="text-ink underline underline-offset-4"
            >
              Guard runs
            </Link>
            <Link
              href="/profile"
              className="text-ink underline underline-offset-4"
            >
              All orders
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

/** An order (TASKS T11.9; design "Paid receipt"), with post-purchase checks (T15). */
export default async function OrderPage({
  params,
  searchParams,
}: PageProps<"/orders/[id]">) {
  const { id } = await params;
  const celebrate = (await searchParams).paid === "1";
  if (id === FLAGSHIP_ORDER) {
    const [order, story] = await Promise.all([
      flagshipOrder(),
      flagshipStory(),
    ]);
    const items = story.v8.contract.items.map((i) => ({
      title: i.title,
      sku: i.sku,
      gtin: i.gtin ?? null,
      qty: i.qty,
    }));
    // Demo boxes: the monitor you approved, and the v7 monitor whose listing changed.
    const approved = story.v8.contract.items.find((i) => i.role === "monitor");
    const trap = story.v7.contract.items.find((i) => i.role === "monitor");
    const samples = [
      ...(approved?.gtin ? [{ label: "Right box", gtin: approved.gtin }] : []),
      ...(trap?.gtin && trap.gtin !== approved?.gtin
        ? [{ label: "Wrong box", gtin: trap.gtin }]
        : []),
    ];
    return (
      <OrderSummary
        orderId={order.id}
        order={order}
        demo
        celebrate
        delivery={
          <DeliveryCheck
            orderId={order.id}
            items={items}
            scans={[]}
            samples={samples}
          />
        }
      />
    );
  }
  if (!UUID.test(id)) notFound();
  const [receipt, delivery] = await Promise.all([
    storedReceipt(id),
    storedOrderDelivery(id),
  ]);
  if (!receipt) notFound();
  return (
    <OrderSummary
      orderId={receipt.orderId}
      order={receipt.view}
      demo={false}
      celebrate={celebrate}
      delivery={
        delivery && (
          <DeliveryCheck
            orderId={receipt.orderId}
            items={delivery.items}
            scans={delivery.scans}
          />
        )
      }
    />
  );
}
