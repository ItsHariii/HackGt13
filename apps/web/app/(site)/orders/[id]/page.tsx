import { formatMoneyText } from "@cartel/proof-engine";
import { Download, FileWarning } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GuardStepper } from "@/components/cartel/guard-stepper";
import { HashPill } from "@/components/cartel/hash-pill";
import { HighFive } from "@/components/doodle/moments";
import { DeliveryCheck } from "@/components/orders/delivery-check";
import { Receipt } from "@/components/orders/receipt";
import { DemoNote } from "@/components/plan/plan-header";
import { Button } from "@/components/ui/button";
import { UUID } from "@/lib/catalog";
import { formatStamp } from "@/lib/contract-view";
import {
  FLAGSHIP,
  FLAGSHIP_ORDER,
  flagshipOrder,
  flagshipStory,
} from "@/lib/flagship";
import { storedOrder, storedOrderDelivery } from "@/lib/orders";

export const metadata: Metadata = { title: "Order" };

/** An order (TASKS T11.9; design "Paid receipt"), with post-purchase checks (T15). */
export default async function OrderPage({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params;
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
      <main className="dot-grid text-graphite">
        <div className="mx-auto grid max-w-[1440px] gap-[72px] px-5 pb-16 sm:px-10 lg:grid-cols-[520px_minmax(0,1fr)] xl:px-[120px]">
          <Receipt order={order} />
          <div className="flex flex-col gap-9 pt-10 lg:pt-[72px]">
            <HighFive h={150} />
            <p className="flex flex-wrap items-center gap-2 font-semibold text-meta text-muted uppercase tracking-label">
              {order.title} · Order {order.id} <DemoNote />
            </p>
            <div className="-mt-6 flex flex-col gap-2.5">
              <h1 className="font-semibold font-serif text-[38px] leading-[1.05] tracking-[-0.03em] sm:text-[48px]">
                Paid. Exactly what you approved.
              </h1>
              <p className="max-w-[560px] text-[18px] text-graphite-2 leading-normal">
                Contract v{order.contractVersion} was re-checked against the
                live checkout at {order.when}. Every hard rule passed, so the
                payment went through.
              </p>
            </div>
            <div className="max-w-[620px]">
              <GuardStepper steps={order.steps} label="Order status" />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <a href={`/orders/${order.id}/evidence-pack`} download>
                  <Download size={16} aria-hidden="true" /> Download Evidence
                  Pack
                </a>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/orders/${order.id}/dispute`}>
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
            <DeliveryCheck
              orderId={order.id}
              items={items}
              scans={[]}
              samples={samples}
            />
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
              Verified agent Cartel (RFC 9421) · Customer-signed contract
              verified by the merchant
            </p>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-small">
              <Link
                href={`/ledger/${FLAGSHIP}`}
                className="text-ink underline underline-offset-4"
              >
                Ledger
              </Link>
              <Link
                href={`/plans/${FLAGSHIP}/contract`}
                className="text-ink underline underline-offset-4"
              >
                Contract v{order.contractVersion}
              </Link>
              <Link
                href={`/plans/${FLAGSHIP}/checkout`}
                className="text-ink underline underline-offset-4"
              >
                Guard runs
              </Link>
            </p>
          </div>
        </div>
      </main>
    );
  }
  if (!UUID.test(id)) notFound();
  const [order, delivery] = await Promise.all([
    storedOrder(id),
    storedOrderDelivery(id),
  ]);
  if (!order) notFound();
  return (
    <main className="dot-grid min-h-[60vh] text-graphite">
      <div className="mx-auto flex max-w-[760px] flex-col gap-4 px-5 py-12">
        <h1 className="font-semibold font-serif text-h2 tracking-heading">
          Order {order.merchant_order_id}
        </h1>
        <dl className="sheet grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 p-5 text-ui">
          <dt className="text-muted">Merchant</dt>
          <dd>{order.merchant_id}</dd>
          <dt className="text-muted">Status</dt>
          <dd>{order.status}</dd>
          <dt className="text-muted">Total</dt>
          <dd className="num">
            {formatMoneyText(order.total_minor, order.currency)}
          </dd>
          <dt className="text-muted">Placed</dt>
          <dd>{formatStamp(order.created_at)}</dd>
          {delivery && (
            <>
              <dt className="text-muted">Contract</dt>
              <dd className="flex flex-wrap items-center gap-2">
                v{delivery.version} <HashPill hash={delivery.hash} />
              </dd>
            </>
          )}
        </dl>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <a href={`/orders/${order.id}/evidence-pack`}>
              <Download size={16} aria-hidden="true" /> Download Evidence Pack
            </a>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/orders/${order.id}/dispute`}>
              <FileWarning size={16} aria-hidden="true" /> Dispute packet
            </Link>
          </Button>
        </div>
        <p className="text-muted text-small">
          Unzip the Evidence Pack and run{" "}
          <code className="font-mono">node verify.mjs</code> to re-check the
          contract hash, your passkey signature and the ledger offline.
        </p>
        {delivery && (
          <DeliveryCheck
            orderId={order.id}
            items={delivery.items}
            scans={delivery.scans}
          />
        )}
      </div>
    </main>
  );
}
