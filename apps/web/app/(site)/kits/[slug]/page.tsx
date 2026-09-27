import { effectiveImportance } from "@cartel/contracts";
import { PACKS } from "@cartel/rule-packs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GlobalTrays } from "@/components/cartel/global-trays";
import { ProductCard } from "@/components/cartel/product-card";
import { RequirementChip } from "@/components/cartel/requirement-chip";
import { Figure } from "@/components/doodle/figure";
import { MakeItMine } from "@/components/kits/make-it-mine";
import { StatusMark } from "@/components/paper/status-mark";
import { DemoNote } from "@/components/plan/plan-header";
import { kitProducts } from "@/lib/kit-shelf";
import { loadKits } from "@/lib/kits";
import { ruleText } from "@/lib/workspace";

export const metadata: Metadata = { title: "Kit" };

/** A kit (TASKS T11.18): its rules and starter basket; Make it mine → forkKit. */
export default async function KitPage({ params }: PageProps<"/kits/[slug]">) {
  const { slug } = await params;
  const kit = (await loadKits()).find((k) => k.slug === slug);
  if (!kit) notFound();
  const own = PACKS[kit.pack];
  const packs = own ? [own] : Object.values(PACKS);
  const products = await kitProducts(kit);
  return (
    <>
      <main className="dot-grid text-graphite">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-10 px-5 py-12 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex max-w-[64ch] flex-col gap-3">
              <p className="flex items-center gap-2 font-semibold text-meta text-muted uppercase tracking-label">
                Kit · {PACKS[kit.pack]?.title ?? kit.pack}
                {kit.demo && <DemoNote label="Demo data" />}
              </p>
              <h1 className="font-semibold font-serif text-h2 tracking-heading">
                {kit.title}
              </h1>
              <p className="text-body text-graphite-2">{kit.description}</p>
              <MakeItMine
                slug={kit.slug}
                demoPlan={
                  kit.slug === "starter-home-office" ? "flagship" : null
                }
              />
            </div>
            <div aria-hidden="true">
              <Figure who="scout" pose="sit" h={112} />
            </div>
          </div>

          <section aria-labelledby="rules" className="flex flex-col gap-3">
            <h2 id="rules" className="font-semibold font-serif text-h4">
              Rules
            </h2>
            <ul className="grid gap-2 md:grid-cols-2">
              {kit.requirements.map((r) => (
                <li
                  key={r.id}
                  className="sheet flex items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="font-semibold text-ui">
                    {ruleText(r, packs)}
                  </span>
                  <span className="flex items-center gap-2 text-meta">
                    <span className="font-mono text-muted">
                      {effectiveImportance(r) === "hard" ? "HARD" : "PREF"}
                    </span>
                    <RequirementChip kind="default" />
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="basket" className="flex flex-col gap-3">
            <h2 id="basket" className="font-semibold font-serif text-h4">
              Starter basket
            </h2>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {products.map((p) => (
                <li key={p.card.id} className="flex min-w-0 flex-col gap-2">
                  <p className="font-semibold text-meta text-muted uppercase tracking-label">
                    {p.role}
                  </p>
                  <ProductCard product={p.card} />
                  <StatusMark
                    status={p.fails ? "fail" : p.passes ? "pass" : "unknown"}
                    label={
                      p.fails
                        ? `${p.fails} kit rule${p.fails === 1 ? "" : "s"} fail`
                        : p.passes
                          ? "Passes the kit's rules"
                          : "Can't check every rule"
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
      <GlobalTrays />
    </>
  );
}
