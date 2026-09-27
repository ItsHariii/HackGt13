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
        <div className="mx-auto flex max-w-[1440px] flex-col px-5 pb-24 sm:px-12">
          <div className="flex flex-wrap items-center justify-between gap-3 pt-5">
            <nav aria-label="Breadcrumb" className="text-[14px] text-muted">
              <ol className="flex flex-wrap items-center gap-2">
                <li className="flex gap-2">
                  <Link
                    href="/search"
                    className="text-ink underline-offset-[3px] hover:underline"
                  >
                    Search
                  </Link>
                  <span aria-hidden="true">/</span>
                </li>
                {view.category && (
                  <li className="flex gap-2">
                    <Link
                      href={`/search?q=${encodeURIComponent(view.category)}`}
                      className="underline-offset-[3px] hover:underline"
                    >
                      {view.category}
                    </Link>
                    <span aria-hidden="true">/</span>
                  </li>
                )}
                <li aria-current="page" className="text-graphite">
                  {view.title}
                </li>
              </ol>
            </nav>
            <Link
              href="/plans/flagship"
              className="inline-flex h-10 items-center gap-2.5 rounded-card border border-ink bg-paper-raised px-3.5 text-[14px] no-underline"
            >
              <span aria-hidden="true" className="size-2 rounded-full bg-ink" />
              <span className="font-semibold text-ink">Plan: Home office</span>
              <span className="num text-graphite">$896.05</span>
            </Link>
          </div>

          <div className="grid items-start gap-12 pt-5 lg:grid-cols-2">
            <div className="flex flex-col gap-3.5 rounded-card border border-rule bg-paper-raised p-5 shadow-stack">
              <div
                role="img"
                aria-label={`No photo for ${view.title}`}
                className="flex h-[300px] items-center justify-center rounded-sheet bg-[repeating-linear-gradient(135deg,#f3eee2_0_12px,#ece5d6_12px_24px)] sm:h-[540px] dark:bg-[repeating-linear-gradient(135deg,#1f3352_0_12px,#223556_12px_24px)]"
              >
                <span className="rounded-[4px] bg-paper px-2.5 py-1 font-mono text-[13px] text-muted">
                  product photo · front
                </span>
              </div>
              <div
                aria-hidden="true"
                className="hidden grid-cols-5 gap-2.5 sm:grid"
              >
                {["front", "side", "ports", "stand", "in box"].map((v, i) => (
                  <span
                    key={v}
                    className={`flex h-[88px] items-center justify-center rounded-sheet bg-[repeating-linear-gradient(135deg,#f3eee2_0_6px,#ece5d6_6px_12px)] font-mono text-[11px] text-muted dark:bg-[repeating-linear-gradient(135deg,#1f3352_0_6px,#223556_6px_12px)] ${i === 0 ? "border-2 border-graphite" : "border border-rule"}`}
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-7">
              <div className="flex flex-col gap-2.5">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-[13px] text-muted uppercase tracking-[0.08em]">
                  {[view.brand, view.category].filter(Boolean).join(" · ")}
                  {demo && <DemoNote label="Demo data" />}
                </p>
                <h1 className="text-balance font-semibold font-serif text-[30px] leading-[1.08] tracking-[-0.03em] sm:text-[42px]">
                  {view.title}
                </h1>
                {view.gtin && (
                  <p className="num text-muted text-small">GTIN {view.gtin}</p>
                )}
              </div>
              <OfferPicker view={view} pass={pass} fail={fail} />

              {view.checks.length > 0 && (
                <section aria-labelledby="checks" className="relative mt-11">
                  <div
                    aria-hidden="true"
                    className="absolute -top-[106px] right-7 hidden sm:block"
                  >
                    <Figure
                      who="inspector"
                      pose={fail ? "idle" : "thumbs"}
                      h={108}
                    />
                  </div>
                  <div className="rounded-card border border-rule bg-paper-raised px-6 pt-[22px] pb-3 shadow-stack">
                    <div className="flex flex-wrap items-baseline gap-3 border-graphite border-b pb-3.5">
                      <h2
                        id="checks"
                        className="font-semibold font-serif text-[22px] tracking-[-0.02em]"
                      >
                        Checks against your plan
                      </h2>
                      <p className="text-[14px] text-muted">
                        Home office · Plan A
                      </p>
                    </div>
                    <ul className="flex flex-col">
                      {view.checks.map((c, i) => (
                        <li
                          key={c.id}
                          className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-[13px] ${i > 0 ? "border-rule-soft border-t" : ""}`}
                        >
                          <span className="flex items-center gap-3 text-[15px]">
                            <StatusMark
                              status={STATUS[c.status]}
                              size={20}
                              className="shrink-0"
                            />
                            <span className="text-graphite">· {c.rule}</span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="num text-[14px] text-ink">
                              {c.value}
                            </span>
                            <span className="hidden text-[12px] text-muted sm:inline">
                              {c.evidence}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              )}
            </div>
          </div>

          <section
            aria-labelledby="specs"
            className="flex flex-col gap-[18px] pt-16"
          >
            <div className="flex flex-wrap items-baseline gap-4">
              <h2
                id="specs"
                className="font-semibold font-serif text-[28px] tracking-[-0.025em] sm:text-[32px]"
              >
                Specs with receipts
              </h2>
              <p className="text-[15px] text-muted">Who says so, and when</p>
            </div>
            <SpecTable view={view} />
          </section>
        </div>
      </main>
      <GlobalTrays />
    </>
  );
}
