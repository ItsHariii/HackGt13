import type { Metadata } from "next";
import Link from "next/link";
import { GlobalTrays } from "@/components/cartel/global-trays";
import { ProductCard } from "@/components/cartel/product-card";
import { Figure } from "@/components/doodle/figure";
import { RecentlyViewed } from "@/components/explore/recently-viewed";
import { kitProducts } from "@/lib/kit-shelf";
import { loadKits } from "@/lib/kits";

/** Reads the visitor's session and live data on every request. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Explore" };

const CATEGORIES = [
  ["Monitors", "monitor"],
  ["Desks", "desk"],
  ["Chairs", "chair"],
  ["Cables", "cable"],
  ["Webcams", "webcam"],
  ["Dresses", "dress"],
  ["Shoes", "shoes"],
  ["Carry-on bags", "carry-on"],
] as const;

/** Explore (TASKS T11.15): categories, kits, shelves that pass them, recently viewed. Works signed out. */
export default async function ExplorePage() {
  const kits = await loadKits();
  const shelves = await Promise.all(
    kits.map(async (k) => ({
      kit: k,
      products: (await kitProducts(k)).filter((p) => p.passes),
    })),
  );
  return (
    <>
      <main className="dot-grid text-graphite">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-12 px-5 py-12 sm:px-8">
          <div className="flex flex-col gap-4">
            <h1 className="font-semibold font-serif text-h2 tracking-heading">
              Explore
            </h1>
            <search>
              <form
                action="/search"
                className="flex max-w-[720px] items-center gap-2"
              >
                <label htmlFor="explore-q" className="sr-only">
                  Search products
                </label>
                <input
                  id="explore-q"
                  name="q"
                  placeholder="Search products or describe what you need"
                  className="h-12 min-w-0 flex-1 rounded-[10px] border border-graphite bg-paper-raised px-4 text-[16px] shadow-offset placeholder:text-muted"
                />
                <button
                  type="submit"
                  className="h-12 rounded-card bg-graphite px-4 font-semibold text-paper-raised"
                >
                  Search
                </button>
              </form>
            </search>
          </div>

          <section aria-labelledby="cats" className="flex flex-col gap-3">
            <h2 id="cats" className="font-semibold font-serif text-h4">
              Categories
            </h2>
            <ul className="flex flex-wrap gap-2">
              {CATEGORIES.map(([label, q]) => (
                <li key={q}>
                  <Link
                    href={`/search?q=${encodeURIComponent(q)}`}
                    className="inline-flex h-10 items-center rounded-pill border border-rule bg-paper-raised px-4 font-semibold text-ui hover:border-graphite"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section
            id="kits"
            aria-labelledby="kits-h"
            className="flex scroll-mt-6 flex-col gap-3"
          >
            <h2 id="kits-h" className="font-semibold font-serif text-h4">
              Kits
            </h2>
            <p className="text-muted text-small">
              A kit is a set of rules and a starter basket. Make it yours and
              change anything.
            </p>
            <ul className="grid gap-4 md:grid-cols-3">
              {kits.map((k) => (
                <li key={k.slug}>
                  <Link
                    href={`/kits/${k.slug}`}
                    className="sheet flex h-full flex-col gap-3 p-5 hover:border-graphite"
                  >
                    <span aria-hidden="true">
                      <Figure who="scout" pose="q" h={64} />
                    </span>
                    <span className="font-semibold font-serif text-h4">
                      {k.title}
                    </span>
                    <span className="text-graphite-2 text-small">
                      {k.description}
                    </span>
                    <span className="mt-auto text-muted text-small">
                      {k.requirements.length} rules · {k.items.length} starter
                      items
                      {k.demo ? " · demo" : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {shelves
            .filter((s) => s.products.length > 0)
            .map((s) => (
              <section
                key={s.kit.slug}
                aria-labelledby={`shelf-${s.kit.slug}`}
                className="flex flex-col gap-3"
              >
                <h2
                  id={`shelf-${s.kit.slug}`}
                  className="font-semibold font-serif text-h4"
                >
                  Passes “{s.kit.title}”
                </h2>
                <p className="text-muted text-small">
                  Every rule of the kit that applies to the product passes,
                  checked by the proof engine.
                </p>
                <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 [&>li]:flex [&>li>*]:flex-1">
                  {s.products.map((p) => (
                    <li key={p.card.id}>
                      <ProductCard product={p.card} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}

          <RecentlyViewed />
        </div>
      </main>
      <GlobalTrays />
    </>
  );
}
