import { HashPill } from "@/components/cartel/hash-pill";
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
        className="h-[18px] w-[min(500px,100%)] rounded-b-[6px] bg-graphite shadow-[0_6px_10px_-4px_rgb(43_42_40/.5)]"
      />
      <div className="receipt-print -mt-1.5 w-[min(440px,92%)] overflow-hidden pb-3 [filter:drop-shadow(0_14px_16px_rgb(43_42_40/.18))]">
        <section
          aria-label="Receipt"
          className="flex flex-col bg-paper-sheet bg-[linear-gradient(180deg,rgb(43_42_40/.08),transparent_22px)] px-[34px] pt-[34px] pb-[26px] font-mono text-[13.5px] text-graphite"
        >
          <header className="flex flex-col items-center gap-1 text-center">
            <p className="font-semibold font-serif text-[17px] tracking-[0.14em]">
              CARTEL · RECEIPT
            </p>
            <p className="text-[12px] text-muted">
              {order.when} · {order.merchant}
            </p>
          </header>
          <div className="mt-[22px] mb-[18px] flex items-center justify-between border-pencil border-y border-dashed py-3.5">
            <span className="-rotate-[4deg] rounded-[3px] border-[3px] border-green-check px-3.5 py-1 font-bold text-[24px] text-green-check tracking-[0.2em] [filter:url(#stamp)]">
              PAID
            </span>
            <span className="font-semibold text-[30px] tabular-nums tracking-[-0.02em]">
              {order.total}
            </span>
          </div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-[7px] tabular-nums">
            {order.lines.map((l) => (
              <div key={l.label} className="contents">
                <dt className="truncate">{l.label}</dt>
                <dd className="text-right">{l.amount}</dd>
              </div>
            ))}
            <dt className="border-[#c9c1af] border-t border-dashed pt-1.5 text-muted">
              Shipping
            </dt>
            <dd className="border-[#c9c1af] border-t border-dashed pt-1.5 text-right">
              {order.shipping}
            </dd>
            <dt className="text-muted">Tax</dt>
            <dd className="text-right">{order.tax}</dd>
            <dt className="border-graphite border-t pt-1.5 font-bold">TOTAL</dt>
            <dd className="border-graphite border-t pt-1.5 text-right font-bold">
              {order.total}
            </dd>
          </dl>
          <dl className="mt-5 grid grid-cols-[118px_1fr] gap-x-2.5 gap-y-2 border-pencil border-t border-dashed pt-4 text-[12.5px]">
            <dt className="text-muted">PROCESSOR</dt>
            <dd>{order.processor}</dd>
            <dt className="text-muted">STATUS</dt>
            <dd className="font-bold">{order.status}</dd>
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
        <div
          aria-hidden="true"
          className="h-3 bg-[radial-gradient(circle_at_8px_0,var(--color-paper-sheet)_7.5px,transparent_8px)] bg-[length:16px_12px] bg-repeat-x"
        />
      </div>
    </div>
  );
}
