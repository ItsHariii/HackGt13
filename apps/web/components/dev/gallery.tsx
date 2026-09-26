"use client";
import { type ReactNode, useState } from "react";
import { CheckoutTierBadge } from "@/components/cartel/checkout-tier-badge";
import { CommandBar } from "@/components/cartel/command-bar";
import { ContractDiff } from "@/components/cartel/contract-diff";
import { EvidenceBadge } from "@/components/cartel/evidence-badge";
import { FacetChip } from "@/components/cartel/facet-chip";
import { GuardStepper } from "@/components/cartel/guard-stepper";
import { HashPill } from "@/components/cartel/hash-pill";
import { LayersTable } from "@/components/cartel/layers-table";
import {
  LedgerLegend,
  LedgerTimeline,
} from "@/components/cartel/ledger-timeline";
import { MerchantStatusTable } from "@/components/cartel/merchant-status-table";
import { PlanCard } from "@/components/cartel/plan-card";
import { ProductCard } from "@/components/cartel/product-card";
import { ProofRow, ProofSummary } from "@/components/cartel/proof";
import { RequirementChip } from "@/components/cartel/requirement-chip";
import { SourcePill } from "@/components/cartel/source-pill";
import {
  SpecReceiptRow,
  SpecReceiptTable,
} from "@/components/cartel/spec-receipt-row";
import { CompareTray, PlanTray } from "@/components/cartel/trays";
import { Mark } from "@/components/paper/mark";
import { Stamp } from "@/components/paper/stamp";
import { StatusMark } from "@/components/paper/status-mark";
import { Button } from "@/components/ui/button";
import * as F from "@/lib/dev-fixtures";

function Section({
  title,
  task,
  children,
}: {
  title: string;
  task: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-rule border-t pt-6">
      <h3 className="flex items-baseline gap-3 font-serif text-h4">
        {title}
        <span className="font-mono font-normal text-meta text-muted tracking-normal">
          {task}
        </span>
      </h3>
      {children}
    </section>
  );
}

/** Every Phase 10 component with the design's example data (T10.2, T10.3). */
export function Gallery({ theme }: { theme: "paper" | "blueprint" }) {
  const [compare, setCompare] = useState<string[]>(["harbor", "marlow"]);
  const [linen, setLinen] = useState(true);
  const [cotton, setCotton] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const toggle = (id: string, on: boolean) =>
    setCompare((c) => (on ? [...c, id] : c.filter((x) => x !== id)));
  return (
    <div className="flex flex-col gap-8">
      <Section title="Status, stamps and marks" task="T10.2">
        <div className="flex flex-wrap items-center gap-5">
          <StatusMark status="pass" />
          <StatusMark status="fail" />
          <StatusMark status="unknown" />
          <StatusMark status="estimate" />
          <StatusMark status="info" />
        </div>
        <div className="flex flex-wrap items-center gap-8 py-2">
          <Stamp tone="signed" detail="Sep 26, 10:42">
            SIGNED v7
          </Stamp>
          <Stamp tone="paid">PAID</Stamp>
          <Stamp tone="blocked">BLOCKED</Stamp>
        </div>
        <p className="max-w-prose text-body">
          USB-C power is now <Mark type="circle">15 W</Mark>, below the 65 W you
          required. The listing says{" "}
          <Mark type="highlight">“Up to 15 W power delivery”</Mark>.{" "}
          <Mark type="bracket">One edit on SKU U2727.</Mark>
        </p>
        <div className="flex flex-wrap gap-3">
          <Button>Build my plan</Button>
          <Button variant="outline">Compare</Button>
          <Button variant="link">Cancel this purchase</Button>
        </div>
      </Section>

      <Section title="Requirements and evidence" task="T10.3">
        <div className="flex flex-wrap gap-2">
          <RequirementChip kind="said" quote="a desk no wider than 48 inches" />
          <RequirementChip kind="chose" />
          <RequirementChip kind="assumed" />
          <RequirementChip kind="confirmed" />
          <RequirementChip kind="default" />
          <RequirementChip kind="cant" />
        </div>
        <div className="flex flex-wrap gap-2">
          <EvidenceBadge
            level="confirmed"
            detail="Merchant checkout · 12 s ago"
          />
          <EvidenceBadge level="manufacturer" />
          <EvidenceBadge level="seller" />
          <EvidenceBadge level="suggests" />
          <EvidenceBadge level="estimate" />
          <EvidenceBadge level="cant" />
          <EvidenceBadge level="disagree" />
        </div>
        <div className="flex flex-wrap gap-2">
          <CheckoutTierBadge tier="full" />
          <CheckoutTierBadge tier="handoff" />
          <CheckoutTierBadge tier="proof" />
        </div>
      </Section>

      <Section title="Proof" task="T10.3">
        <div className="sheet max-w-[520px] overflow-hidden">
          <div className="border-graphite border-b p-5">
            <ProofSummary
              ticks={F.ticks}
              sub="1 can't check (waived) · 1 estimate"
            />
          </div>
          <ol>
            {F.proofRows.map((r, i) => (
              <ProofRow
                key={r.id}
                row={r}
                href={`#${theme}-proof`}
                active={i === 1}
              />
            ))}
          </ol>
        </div>
      </Section>

      <Section title="Plans and products" task="T10.3">
        <div className="grid gap-4 sm:grid-cols-3">
          {F.plans.map((p, i) => (
            <PlanCard
              key={p.label}
              {...p}
              selected={i === 0}
              href={`#${theme}-plans`}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {F.products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              compared={compare.includes(p.id)}
              onCompare={toggle}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <SourcePill name="Shopify Catalog" state="done" count={42} />
          <SourcePill name="UPCitemdb" state="searching" />
          <SourcePill name="GreatHub (test merchant)" state="done" count={6} />
          <SourcePill name="Icecat" state="error" />
        </div>
        <div className="sheet max-w-[360px] p-4">
          <p className="pb-1 font-semibold text-meta uppercase tracking-label">
            Fiber
          </p>
          <FacetChip
            label="Linen ≥ 90%"
            count={31}
            checked={linen}
            onChange={setLinen}
            onAddRule={() => setAdded("Fiber linen ≥ 90%")}
            ruleText="Fiber linen ≥ 90%"
          />
          <FacetChip
            label="Cotton"
            count={9}
            checked={cotton}
            onChange={setCotton}
            onAddRule={() => setAdded("Fiber cotton")}
          />
          <p aria-live="polite" className="pt-1 text-muted text-small">
            {added ? `Rule added: ${added} (You chose).` : ""}
          </p>
        </div>
        <SpecReceiptTable caption="Specs with receipts">
          {F.specs.map((s) => (
            <SpecReceiptRow
              key={s.spec}
              receipt={s}
              onMakeRule={() => setAdded(`${s.spec} ${s.value}`)}
            />
          ))}
        </SpecReceiptTable>
      </Section>

      <Section title="Contract, guard and ledger" task="T10.3">
        <div className="flex flex-wrap items-center gap-3">
          <HashPill hash={F.hashV7} />
          <HashPill hash={F.hashV8} />
        </div>
        <LayersTable
          layers={F.layers}
          caption="What was checked — 4 layers, in order"
        />
        <ContractDiff
          from="v7 sha256:7c1e…a94f"
          to="v8 sha256:b04d…19e2"
          lines={F.diff}
        />
        <MerchantStatusTable rows={F.merchants} />
        <GuardStepper steps={F.orderSteps} label="Order progress" />
        <div className="sheet overflow-hidden">
          <LedgerTimeline entries={F.ledger} />
          <div className="p-3">
            <LedgerLegend />
          </div>
        </div>
      </Section>

      <Section title="Command bar and trays" task="T10.3">
        <CommandBar
          label={`Describe what you need (${theme})`}
          disabledReason="Example only. Nothing is sent."
        />
        <div className="sheet overflow-hidden">
          <PlanTray count={0} href={`#${theme}-tray`} />
          <PlanTray count={5} total="$896.05" href={`#${theme}-tray`} />
          <CompareTray
            items={F.products
              .filter((p) => compare.includes(p.id))
              .map(({ id, name, price }) => ({ id, name, price }))}
            onRemove={(id) => toggle(id, false)}
            href={`#${theme}-compare`}
          />
        </div>
      </Section>
    </div>
  );
}
