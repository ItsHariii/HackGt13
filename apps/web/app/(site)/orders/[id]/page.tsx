import { formatMoneyText } from "@cartel/proof-engine";
import { Download, ScanLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GuardStepper } from "@/components/cartel/guard-stepper";
import { HighFive } from "@/components/doodle/moments";
import { Receipt } from "@/components/orders/receipt";
import { DemoNote } from "@/components/plan/plan-header";
import { Button } from "@/components/ui/button";
import { UUID } from "@/lib/catalog";
import { formatStamp } from "@/lib/contract-view";
import { FLAGSHIP, FLAGSHIP_ORDER, flagshipOrder } from "@/lib/flagship";
import { storedOrder } from "@/lib/orders";

export const metadata: Metadata = { title: "Order" };

/** An order (TASKS T11.9; design "Paid receipt"). */
export default async function OrderPage({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  if (id === FLAGSHIP_ORDER) {
    const order = await flagshipOrder();
    return (
      <main className="dot-grid text-graphite">
        <div className="mx-auto grid max-w-[1180px] gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[420px_minmax(0,1fr)]">
          <Receipt order={order} />
          <div className="flex flex-col gap-6">
            <HighFive h={120} />
            <p className="flex flex-wrap items-center gap-2 font-semibold text-meta text-muted uppercase tracking-label">
              {order.title} · Order {order.id} <DemoNote />
            </p>
            <h1 className="font-semibold font-serif text-h2 tracking-heading">
              Paid. Exactly what you approved.
            </h1>
            <p className="max-w-[56ch] text-body text-graphite-2">
              Contract v{order.contractVersion} was re-checked against the live
              checkout at {order.when}. Every hard rule passed, so the payment
              went through.
            </p>
            <GuardStepper steps={order.steps} label="Order progress" />
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <a href={`/orders/${order.id}/evidence-pack`} download>
                  <Download size={16} aria-hidden="true" /> Download Evidence
                  Pack
                </a>
              </Button>
              <Button
                variant="outline"
                disabled
                title="Delivery scanning arrives with post-purchase checks (TASKS T15)."
              >
                <ScanLine size={16} aria-hidden="true" /> Scan delivery
              </Button>
            </div>
            <p className="text-muted text-small">
              Scan delivery arrives with post-purchase checks. The Evidence Pack
              holds the signed contract, the proof report and the ledger, so
              anyone can re-verify them offline.
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
  const order = await storedOrder(id);
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
        </dl>
      </div>
    </main>
  );
}
