import type { Metadata } from "next";
import { Wordmark } from "@/components/brand/wordmark";
import { Gallery } from "@/components/dev/gallery";

export const metadata: Metadata = {
  title: "Components",
  robots: { index: false },
};

/**
 * The component sheet (TASKS T10.2, T10.3): every piece in paper and in
 * Blueprint, with the design's example data. `pnpm --filter @cartel/web
 * test:a11y` runs axe against this page.
 */
export default function ComponentsPage() {
  return (
    <main className="min-h-dvh bg-desk">
      <header className="flex items-center gap-4 border-graphite border-b-[3px] border-double bg-paper px-6 py-5">
        <Wordmark className="text-[24px]" size={31} />
        <h1 className="font-serif text-h4">Components</h1>
      </header>
      <div className="grid gap-px 2xl:grid-cols-2">
        <section
          aria-labelledby="paper-theme"
          className="dot-grid p-6 text-graphite sm:p-10"
        >
          <h2 id="paper-theme" className="mb-6 font-serif text-h3">
            Paper
          </h2>
          <Gallery theme="paper" />
        </section>
        <section
          aria-labelledby="blueprint-theme"
          className="blueprint dot-grid p-6 text-graphite sm:p-10"
        >
          <h2 id="blueprint-theme" className="mb-6 font-serif text-h3">
            Blueprint
          </h2>
          <Gallery theme="blueprint" />
        </section>
      </div>
    </main>
  );
}
