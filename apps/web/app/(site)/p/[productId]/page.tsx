import { FLAGSHIP_REQUIREMENTS } from "@cartel/contracts/fixtures";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GlobalTrays } from "@/components/cartel/global-trays";
import { Figure } from "@/components/doodle/figure";
import { StatusMark } from "@/components/paper/status-mark";
import { DemoNote } from "@/components/plan/plan-header";
import { OfferPicker, SpecTable } from "@/components/product/product-actions";
import { StateCard } from "@/components/states/edge-states";
import { findProduct } from "@/lib/catalog-read";
import { DEMO_NOW } from "@/lib/demo-catalog";
import { ALL_PACKS } from "@/lib/evidence";
import { productView } from "@/lib/product-view";

export const metadata: Metadata = { title: "Product" };

const STATUS = {
  pass: "pass",
  fail: "fail",
  unknown: "unknown",
  estimate: "estimate",
} as const;

/** The product page (TASKS T11.17; design "Product"). */
export default async function ProductPage({
  params,
}: PageProps<"/p/[productId]">) {
  const id = decodeURIComponent((await params).productId);
  const found = await findProduct(id);
  if (found.status === "not_found") notFound();
  if (found.status === "unavailable")
    return (
      <main className="dot-grid min-h-[60vh] px-5 py-16 text-graphite">
        <div className="mx-auto max-w-[720px]">
          <StateCard
            tone="fail"
            figure={<Figure who="scout" pose="tangled" h={80} />}
            eyebrow="Source error"
            title="The catalog didn't answer."
            headingLevel="h1"
            actions={
              <Link
                href={`/p/${encodeURIComponent(id)}`}
                className="inline-flex min-h-11 items-center rounded-card border border-graphite px-4 font-semibold"
              >
                Retry
              </Link>
            }
          >
            Nothing was added or bought. Try again in a moment.
          </StateCard>
        </div>
      </main>
    );
  const { product, demo } = found;
  const now = demo ? DEMO_NOW : new Date().toISOString();
  // The demo plan is the active plan: its rules are checked against this product.
  const view = productView(product, FLAGSHIP_REQUIREMENTS, ALL_PACKS, now);
  const pass = view.checks.filter(
    (c) => c.status === "pass" || c.status === "estimate",
  ).length;
  const fail = view.checks.filter((c) => c.status === "fail").length;
  return (
    <>
      <main className="dot-grid text-graphite">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-5 py-8 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Breadcrumb" className="text-muted text-small">
              <ol className="flex flex-wrap items-center gap-1.5">
                <li>
                  <Link
                    href="/search"
                    className="underline-offset-4 hover:underline"
                  >
                    Search
                  </Link>{" "}
                  /
                </li>
                {view.category && (
                  <li>
                    <Link
                      href={`/search?q=${encodeURIComponent(view.category)}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {view.category}
                    </Link>{" "}
                    /
                  </li>
                )}
                <li aria-current="page" className="text-graphite">
                  {view.title}
                </li>
              </ol>
            </nav>
            <Link
              href="/plans/flagship"
              className="inline-flex h-8 items-center gap-2 rounded-pill border border-graphite bg-paper-raised px-3 font-semibold text-small"
            >
              Plan: Home office <span className="num text-ink">$896.05</span>
            </Link>
          </div>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div
              role="img"
              aria-label={`No photo for ${view.title}`}
              className="sheet aspect-[4/3] bg-[repeating-linear-gradient(135deg,var(--color-paper)_0_8px,var(--color-paper-shade)_8px_16px)]"
            />
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-meta text-muted uppercase tracking-label">
                  {[view.brand, view.category].filter(Boolean).join(" · ")}
                  {demo && <DemoNote label="Demo data" />}
                </p>
                <h1 className="font-semibold font-serif text-h3 tracking-heading">
                  {view.title}
                </h1>
                {view.gtin && (
                  <p className="num text-muted text-small">GTIN {view.gtin}</p>
                )}
              </div>
              <OfferPicker view={view} pass={pass} fail={fail} />
            </div>
          </div>

          {view.checks.length > 0 && (
            <section
              aria-labelledby="checks"
              className="sheet flex flex-col gap-3 p-5"
            >
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 id="checks" className="font-semibold font-serif text-h4">
                    Checks against your plan
                  </h2>
                  <p className="text-muted text-small">
                    Home office · Plan A · this product's rules only
                  </p>
                </div>
                <div aria-hidden="true">
                  <Figure
                    who="inspector"
                    pose={fail ? "idle" : "thumbs"}
                    h={64}
                  />
                </div>
              </div>
              <ul className="flex flex-col">
                {view.checks.map((c) => (
                  <li
                    key={c.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-rule-soft border-t py-2.5 sm:grid-cols-[150px_minmax(0,1fr)_auto_auto]"
                  >
                    <StatusMark status={STATUS[c.status]} />
                    <span className="font-semibold text-ui">{c.rule}</span>
                    <span className="num text-ink">{c.value}</span>
                    <span className="text-muted text-small">{c.evidence}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <SpecTable view={view} />
        </div>
      </main>
      <GlobalTrays />
    </>
  );
}
