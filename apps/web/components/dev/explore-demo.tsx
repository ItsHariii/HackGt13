"use client";
import { useState } from "react";
import { FacetChip } from "@/components/cartel/facet-chip";
import { ProductCard } from "@/components/cartel/product-card";
import { SourcePill } from "@/components/cartel/source-pill";
import { CompareTray, PlanTray } from "@/components/cartel/trays";
import {
  ExploreGrid,
  ExploreLayout,
} from "@/components/layouts/explore-layout";
import { Mark } from "@/components/paper/mark";
import { products } from "@/lib/dev-fixtures";

const MORE = [...products, ...products].map((p, i) => ({
  ...p,
  id: `${p.id}-${i}`,
}));

/** The Explore layout with the Search design's example data (T10.4). */
export function ExploreDemo() {
  const [linen, setLinen] = useState(true);
  const [navy, setNavy] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const toggle = (id: string, on: boolean) =>
    setCompare((c) => (on ? [...c, id] : c.filter((x) => x !== id)));
  const filters = (
    <>
      <fieldset className="flex flex-col">
        <legend className="pb-1 font-semibold text-small">Fiber</legend>
        <FacetChip
          label="Linen ≥ 90%"
          count={31}
          checked={linen}
          onChange={setLinen}
          onAddRule={() => {}}
          ruleText="Fiber linen ≥ 90%"
        />
      </fieldset>
      <fieldset className="flex flex-col">
        <legend className="pb-1 font-semibold text-small">Color</legend>
        <FacetChip label="Navy" count={27} checked={navy} onChange={setNavy} />
      </fieldset>
      <p className="text-muted text-small">
        Filters hide products. Rules are checked against evidence before you
        pay.
      </p>
    </>
  );
  return (
    <ExploreLayout
      heading={
        <div>
          <h1 className="font-serif text-h3">
            <Mark type="highlight">“navy linen shirt”</Mark>
          </h1>
          <p className="text-muted text-small">31 of 48 results</p>
        </div>
      }
      status={
        <div aria-live="polite" className="flex flex-wrap gap-2">
          <SourcePill name="Shopify Catalog" state="done" count={42} />
          <SourcePill name="UPCitemdb" state="done" count={0} />
          <SourcePill name="GreatHub (test merchant)" state="done" count={6} />
        </div>
      }
      filters={filters}
      activeFilters={Number(linen) + Number(navy)}
      resultCount={31}
      tray={
        <>
          <CompareTray
            items={MORE.filter((p) => compare.includes(p.id))}
            onRemove={(id) => toggle(id, false)}
            href="#compare"
          />
          <PlanTray count={0} href="#plan" />
        </>
      }
    >
      <ExploreGrid label="Results">
        {MORE.map((p) => (
          <li key={p.id}>
            <ProductCard
              product={p}
              compared={compare.includes(p.id)}
              onCompare={toggle}
            />
          </li>
        ))}
      </ExploreGrid>
    </ExploreLayout>
  );
}
