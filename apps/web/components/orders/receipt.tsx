import { HashPill } from "@/components/cartel/hash-pill";
import { Stamp } from "@/components/paper/stamp";
import type { OrderView } from "@/lib/flagship";

/**
 * The paid receipt (design "Revised and Receipt"): it prints down out of a
 * slot in about 1.1 s in 4 px steps; with reduced motion it is simply there.
 */
export function Receipt({ order }: { order: OrderView }) {
  return (
    <div className="flex flex-col items-center">
      <div
        aria-hidden="true"
        className="h-3 w-[min(420px,100%)] rounded-pill bg-graphite"
      />
      <div className="receipt-print w-[min(380px,94%)] overflow-hidden">
        <section
          aria-label="Receipt"
          className="receipt-edge flex flex-col gap-4 bg-paper-sheet px-6 pt-6 pb-10 font-mono text-[13px] text-graphite shadow-page"
        >
          <header className="flex flex-col items-center gap-1 text-center">
            <p className="font-semibold tracking-[0.2em]">CARTEL · RECEIPT</p>
            <p className="text-muted">
              {order.when} · {order.merchant}
            </p>
          </header>
          <div className="flex items-center justify-between">
            <Stamp tone="paid">PAID</Stamp>
            <span className="font-semibold text-[20px]">{order.total}</span>
          </div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-rule border-y border-dashed py-3">
            {order.lines.map((l) => (
              <div key={l.label} className="contents">
                <dt className="truncate">{l.label}</dt>
                <dd className="text-right">{l.amount}</dd>
              </div>
            ))}
            <dt>Shipping</dt>
            <dd className="text-right">{order.shipping}</dd>
            <dt>Tax</dt>
            <dd className="text-right">{order.tax}</dd>
            <dt className="pt-1 font-semibold">TOTAL</dt>
            <dd className="pt-1 text-right font-semibold">{order.total}</dd>
          </dl>
          <dl className="grid grid-cols-[108px_1fr] gap-x-3 gap-y-1.5">
            <dt className="text-muted">PROCESSOR</dt>
            <dd>{order.processor}</dd>
            <dt className="text-muted">STATUS</dt>
            <dd>{order.status}</dd>
            <dt className="text-muted">ORDER</dt>
            <dd>{order.id}</dd>
            <dt className="text-muted">CONTRACT</dt>
            <dd>Purchase contract v{order.contractVersion}</dd>
            <dt className="text-muted">HASH</dt>
            <dd>
              <HashPill hash={order.contractHash} />
            </dd>
            <dt className="text-muted">PROOF</dt>
            <dd>{order.proof}</dd>
            <dt className="text-muted">SIGNED</dt>
            <dd>{order.signed}</dd>
            <dt className="text-muted">RETURNS</dt>
            <dd>{order.returnPolicy}</dd>
          </dl>
        </section>
      </div>
    </div>
  );
}
