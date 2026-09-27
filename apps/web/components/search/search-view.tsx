"use client";
import {
  buildFacets,
  type CatalogProduct,
  type Facet,
  promoteToRule,
} from "@cartel/catalog";
import { canonicalize, type Value } from "@cartel/contracts";
import { formatValue } from "@cartel/proof-engine";
import { PACKS } from "@cartel/rule-packs";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { FacetChip } from "@/components/cartel/facet-chip";
import { GlobalTrays } from "@/components/cartel/global-trays";
import { ProductCard } from "@/components/cartel/product-card";
import { SourcePill } from "@/components/cartel/source-pill";
import { useSearchStatus } from "@/components/doodle/events";
import { Figure } from "@/components/doodle/figure";
import {
  ExploreGrid,
  ExploreLayout,
} from "@/components/layouts/explore-layout";
import { Mark } from "@/components/paper/mark";
import { SourceError, StateCard } from "@/components/states/edge-states";
import { searchAnnouncement } from "@/lib/figure-events";
import { MERCHANT_NAME, productCard } from "@/lib/product-view";
import { trays, useTrays } from "@/lib/tray-store";
import { ruleText } from "@/lib/workspace";

const PACK_LIST = Object.values(PACKS);

function matches(p: CatalogProduct, field: string, value: Value): boolean {
  const key = canonicalize(value);
  return p.facts.some(
    (f) =>
      f.field === field &&
      f.value !== null &&
      (canonicalize(f.value) === key ||
        (Array.isArray(f.value) &&
          f.value.some((x) => canonicalize(x) === key))),
  );
}

/**
 * Search (TASKS T11.16; design "Search"): the per-source strip streams
 * from /api/search, dashed skeletons hold the grid (never a spinner), and
 * each facet value can become a rule. Without the catalog database the
 * page searches the demo catalog and says so.
 */
export function SearchView({
  query,
  sources,
  demo,
  now,
}: {
  query: string;
  sources: string[];
  /** Demo catalog results when the catalog database isn't connected. */
  demo: { products: CatalogProduct[]; facets: Facet[] } | null;
  now: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const live = useSearchStatus(demo || !query ? null : query, sources, attempt);
  // The same product can arrive from several sources; keep the first.
  const products = useMemo(() => {
    const seen = new Set<string>();
    return (demo?.products ?? (live.products as CatalogProduct[])).filter(
      (p) => !seen.has(p.id) && Boolean(seen.add(p.id)),
    );
  }, [demo, live.products]);
  // Facet counts are recomputed over the combined, de-duplicated results,
  // never summed across source chunks (docs/PHASE7B.md).
  const facets = useMemo(
    () => (demo ? demo.facets : buildFacets(products, PACK_LIST, now)),
    [demo, products, now],
  );
  const [selected, setSelected] = useState<Record<string, Value[]>>({});
  const [status, setStatus] = useState("");
  const t = useTrays();

  const filtered = products.filter((p) =>
    Object.entries(selected).every(
      ([field, values]) =>
        values.length === 0 || values.some((v) => matches(p, field, v)),
    ),
  );
  const active = Object.values(selected).reduce((n, v) => n + v.length, 0);
  const cards = filtered.map((p) => productCard(p, PACK_LIST, now));
  const loading = !demo && live.loading;
  const doneCount = live.sources.filter((s) => s.state !== "searching").length;

  const toggle = (field: string, value: Value, on: boolean) =>
    setSelected((s) => {
      const key = canonicalize(value);
      const rest = (s[field] ?? []).filter((v) => canonicalize(v) !== key);
      return { ...s, [field]: on ? [...rest, value] : rest };
    });

  const addRule = (facet: Facet, value: Value) => {
    const role = facet.roles[0];
    if (!role) return;
    try {
      const r = promoteToRule(
        facet.field,
        facet.kind === "list" ? "contains" : "eq",
        facet.kind === "list" ? [value as string] : value,
        "facet",
        { role, packs: PACK_LIST },
      );
      const text = ruleText(r, PACK_LIST);
      const added = trays.addRule({ id: r.id, text, requirement: r });
      setStatus(
        added
          ? `Rule added: ${text} (You chose).`
          : `${text} is already a rule in your tray.`,
      );
    } catch {
      setStatus("That filter can't become a rule.");
    }
  };

  const heading = (
    <div>
      <h1 className="font-serif text-h3">
        {query ? <Mark type="highlight">“{query}”</Mark> : "Search products"}
      </h1>
      {query && (
        <p className="text-muted text-small">
          {filtered.length} of {products.length} results
          {demo ? " · demo catalog" : ""}
        </p>
      )}
    </div>
  );

  const strip = (
    <div className="flex flex-col gap-3">
      <search>
        <form action="/search" className="flex items-center gap-2">
          <label htmlFor="search-q" className="sr-only">
            Search products
          </label>
          <div className="flex h-12 flex-1 items-center gap-2 rounded-[10px] border border-graphite bg-paper-raised px-3 shadow-offset">
            <Search size={18} aria-hidden="true" className="text-muted" />
            <input
              id="search-q"
              name="q"
              defaultValue={query}
              placeholder="Search products or describe what you need"
              className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted"
            />
          </div>
          <button
            type="submit"
            className="h-12 rounded-card bg-graphite px-4 font-semibold text-paper-raised"
          >
            Search
          </button>
        </form>
      </search>
      {query && (
        <div className="flex flex-wrap items-center gap-2">
          <span aria-hidden="true">
            <Figure
              who="scout"
              pose={loading ? `run${(doneCount % 4) + 1}` : "sit"}
              h={44}
            />
          </span>
          {demo ? (
            <SourcePill
              name="Demo catalog"
              state="done"
              count={demo.products.length}
            />
          ) : (
            live.sources.map((s) => (
              <SourcePill
                key={s.source}
                name={MERCHANT_NAME[s.source] ?? s.source}
                state={s.state}
                count={s.count}
              />
            ))
          )}
          <p aria-live="polite" className="sr-only">
            {demo
              ? `Demo catalog: ${demo.products.length} results.`
              : searchAnnouncement(live.sources)}
          </p>
        </div>
      )}
      {demo && query && (
        <p className="text-muted text-small">
          The catalog database isn't connected here, so this searches the demo
          catalog (fixture products).
        </p>
      )}
      {!demo &&
        live.sources
          .filter((s) => s.state === "error")
          .map((s) => (
            <SourceError
              key={s.source}
              source={MERCHANT_NAME[s.source] ?? s.source}
              onRetry={() => setAttempt((a) => a + 1)}
            />
          ))}
    </div>
  );

  const filters = (
    <>
      {facets.length === 0 ? (
        <p className="text-muted text-small">Filters appear with results.</p>
      ) : (
        facets.map((f) => (
          <fieldset key={f.field} className="flex flex-col">
            <legend className="pb-1 font-semibold text-small">{f.label}</legend>
            {f.values.slice(0, 8).map((v) => {
              const label = formatValue(v.value, undefined);
              const checked = (selected[f.field] ?? []).some(
                (x) => canonicalize(x) === canonicalize(v.value),
              );
              return (
                <FacetChip
                  key={canonicalize(v.value)}
                  label={/^\d+k$/i.test(label) ? label.toUpperCase() : label}
                  count={v.count}
                  checked={checked}
                  onChange={(on) => toggle(f.field, v.value, on)}
                  onAddRule={() => addRule(f, v.value)}
                  ruleText={`${f.label} ${label}`}
                />
              );
            })}
          </fieldset>
        ))
      )}
      <p className="text-muted text-small">
        Filters hide products. Rules are checked against evidence before you
        pay.
      </p>
      <p aria-live="polite" className="text-small">
        {status}
      </p>
    </>
  );

  return (
    <ExploreLayout
      heading={heading}
      status={strip}
      filters={filters}
      activeFilters={active}
      resultCount={filtered.length}
      tray={<GlobalTrays />}
    >
      {!query ? (
        <StateCard title="What are you looking for?" eyebrow="Search">
          Try “monitor”, “desk” or “carry-on”. Results come from every connected
          source at once.
        </StateCard>
      ) : loading && cards.length === 0 ? (
        <ExploreGrid label="Loading results">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li key={i} aria-hidden="true">
              <div className="flex h-72 flex-col gap-3 rounded-card border border-pencil border-dashed p-3.5">
                <div className="h-32 rounded-sheet border border-pencil border-dashed" />
                <div className="h-4 w-3/4 rounded-sheet border border-pencil border-dashed" />
                <div className="h-4 w-1/3 rounded-sheet border border-pencil border-dashed" />
              </div>
            </li>
          ))}
        </ExploreGrid>
      ) : cards.length === 0 ? (
        <StateCard
          figure={<Figure who="scout" pose="map" h={80} />}
          title={
            products.length
              ? "No results match these filters."
              : `No matches for “${query}”.`
          }
          eyebrow="No results"
        >
          {products.length
            ? "Clear a filter to see more."
            : "Every source answered with nothing. Try fewer or different words."}
        </StateCard>
      ) : (
        <ExploreGrid label="Results">
          {cards.map((c) => (
            <li key={c.id}>
              <ProductCard
                product={c}
                compared={t.compare.some((x) => x.id === c.id)}
                onCompare={(id, on) => {
                  const ok = trays.toggleCompare(
                    { id, name: c.name, price: c.price },
                    on,
                  );
                  if (!ok) setStatus("Compare holds up to 4 products.");
                }}
              />
            </li>
          ))}
        </ExploreGrid>
      )}
    </ExploreLayout>
  );
}
