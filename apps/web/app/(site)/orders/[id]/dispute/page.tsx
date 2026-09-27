import { formatMoneyText } from "@cartel/proof-engine";
import { FileDown } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HashPill } from "@/components/cartel/hash-pill";
import { Stamp } from "@/components/paper/stamp";
import { DemoNote } from "@/components/plan/plan-header";
import { Button } from "@/components/ui/button";
import { formatStamp } from "@/lib/contract-view";
import { loadDispute } from "@/lib/dispute";

export const metadata: Metadata = { title: "Dispute packet" };
export const dynamic = "force-dynamic";

function Column({
  n,
  title,
  lead,
  children,
}: {
  n: number;
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={`dispute-col-${n}`}
      className="sheet flex min-w-0 flex-col gap-3 p-5"
    >
      <div>
        <p className="font-semibold text-meta text-muted uppercase tracking-label">
          {n} of 3
        </p>
        <h2
          id={`dispute-col-${n}`}
          className="font-semibold font-serif text-h4 tracking-heading"
        >
          {title}
        </h2>
        <p className="text-muted text-small">{lead}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * The dispute packet (TASKS T15.4; SDD §15): approved (signed) vs facts at
 * purchase (snapshots) vs received (scans), exportable as a PDF.
 */
export default async function DisputePage({
  params,
  searchParams,
}: PageProps<"/orders/[id]/dispute">) {
  const { id } = await params;
  const query = await searchParams;
  const loaded = await loadDispute(id, query);
  if (!loaded) notFound();
  const { record, packet: d } = loaded;
  const money = (m: number) => formatMoneyText(m, d.approved.currency);
  const mismatch = d.received.some((r) => !r.matched);
  const pdfQuery = new URLSearchParams();
  if (typeof query.gtin === "string") pdfQuery.set("gtin", query.gtin);
  if (typeof query.method === "string") pdfQuery.set("method", query.method);
  const pdfHref = `/orders/${id}/dispute/pdf${pdfQuery.size ? `?${pdfQuery}` : ""}`;

  return (
    <main className="dot-grid text-graphite">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-8 px-5 py-12 sm:px-8">
        <header className="flex flex-col gap-3">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-meta text-muted uppercase tracking-label">
            Dispute packet · Order {d.merchantOrderId} · {d.merchant}
            {record.demo && <DemoNote />}
          </p>
          <h1 className="font-semibold font-serif text-h2 tracking-heading">
            {d.category}
          </h1>
          <p className="max-w-[64ch] text-body text-graphite-2">
            What you approved and signed, what the evidence said when you paid,
            and what arrived, side by side. Card networks handle this as a “not
            as described” dispute. The merchant can read the same packet as
            proof of exactly what you approved.
          </p>
          {d.received.length > 0 && (
            <div>
              {mismatch ? (
                <Stamp tone="blocked">MISMATCH</Stamp>
              ) : (
                <Stamp tone="paid">MATCHES</Stamp>
              )}
            </div>
          )}
          <ul className="flex max-w-[72ch] flex-col gap-1 text-ui">
            {d.findings.map((f) => (
              <li key={f} className="flex gap-2">
                <span aria-hidden="true">•</span>
                {f}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3 pt-1">
            <Button asChild>
              <a href={pdfHref} download>
                <FileDown size={16} aria-hidden="true" /> Export PDF
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={`/orders/${id}/evidence-pack`} download>
                Evidence Pack
              </a>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/orders/${id}`}>Back to the order</Link>
            </Button>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-3">
          <Column
            n={1}
            title="Approved"
            lead={`Contract v${d.approved.version}, signed with your passkey.`}
          >
            <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-small">
              <dt className="text-muted">Hash</dt>
              <dd>
                <HashPill hash={d.approved.contractHash} />
              </dd>
              <dt className="text-muted">Signed</dt>
              <dd>
                {d.approved.signedAt
                  ? formatStamp(d.approved.signedAt)
                  : "Not signed"}
              </dd>
              <dt className="text-muted">Paid</dt>
              <dd>
                {d.approved.paidAt ? formatStamp(d.approved.paidAt) : "—"}
              </dd>
              <dt className="text-muted">Charged</dt>
              <dd className="num">{money(d.approved.totalMinor)}</dd>
            </dl>
            <ul className="flex flex-col divide-y divide-rule-soft border-rule border-t">
              {d.approved.items.map((i) => (
                <li key={i.sku} className="flex flex-col gap-0.5 py-2">
                  <span className="font-semibold text-small">{i.title}</span>
                  <span className="font-mono text-[12px] text-muted">
                    SKU {i.sku} · GTIN {i.gtin ?? "none"} · ×{i.qty} ·{" "}
                    {money(i.unitPriceMinor)}
                  </span>
                </li>
              ))}
            </ul>
          </Column>

          <Column
            n={2}
            title="Facts at purchase"
            lead="What the sources said when the contract was approved."
          >
            {d.factsAtPurchase.length === 0 ? (
              <p className="text-muted text-small">
                No fact snapshots were recorded for this order.
              </p>
            ) : (
              d.factsAtPurchase.map((item) => (
                <div key={item.sku} className="flex flex-col gap-1">
                  <h3 className="font-semibold text-small">{item.title}</h3>
                  {item.facts.length === 0 ? (
                    <p className="text-muted text-small">No facts recorded.</p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-rule-soft text-small">
                      {item.facts.map((f) => (
                        <li key={f.label} className="flex flex-col py-1">
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="text-muted">{f.label}</span>
                            <span className="text-right font-medium">
                              {f.value}
                            </span>
                          </span>
                          <span className="text-right text-[11px] text-muted">
                            {f.state} · {f.source}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
          </Column>

          <Column
            n={3}
            title="Received"
            lead="Barcodes scanned or typed from the boxes."
          >
            {d.received.length === 0 ? (
              <p className="text-muted text-small">
                Nothing has been scanned yet.{" "}
                <Link
                  href={`/orders/${id}#delivery-heading`}
                  className="text-ink underline underline-offset-4"
                >
                  Check the delivery
                </Link>
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {d.received.map((r) => (
                  <li
                    key={`${r.ledgerSeq}-${r.gtin}-${r.at}`}
                    className={`flex flex-col gap-0.5 border-l-2 pl-3 ${r.matched ? "border-green-check" : "border-red-pen"}`}
                  >
                    <span className="font-mono text-small">{r.gtin}</span>
                    <span
                      className={`text-small ${r.matched ? "text-green-check" : "text-red-pen"}`}
                    >
                      {r.matched
                        ? `Matches ${r.matched.title}`
                        : "Not an item in the contract"}
                    </span>
                    <span className="text-[12px] text-muted">
                      {r.method === "scan" ? "Scanned" : "Typed"} ·{" "}
                      {formatStamp(r.at)}
                      {r.ledgerSeq ? ` · ledger #${r.ledgerSeq}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {d.missing.length > 0 && (
              <div className="flex flex-col gap-1 border-rule border-t pt-2">
                <h3 className="font-semibold text-meta text-muted uppercase tracking-label">
                  Not scanned yet
                </h3>
                <ul className="text-small">
                  {d.missing.map((m) => (
                    <li key={m.sku}>{m.title}</li>
                  ))}
                </ul>
              </div>
            )}
          </Column>
        </div>
      </div>
    </main>
  );
}
