import type { Metadata } from "next";
import { Wordmark } from "@/components/brand/wordmark";
import { FiguresDemo } from "@/components/dev/figures-demo";

export const metadata: Metadata = {
  title: "Figures",
  robots: { index: false },
};

/** Every figure and pose in paper and Blueprint (TASKS T10B.1 check). */
export default function FiguresPage() {
  return (
    <main className="min-h-dvh bg-desk">
      <header className="flex items-center gap-4 border-graphite border-b-[3px] border-double bg-paper px-6 py-5">
        <Wordmark className="text-[24px]" size={31} />
        <h1 className="font-serif text-h4">Figures</h1>
      </header>
      <div className="grid gap-px xl:grid-cols-2">
        <section
          aria-labelledby="paper-theme"
          className="dot-grid p-6 text-graphite sm:p-10"
        >
          <h2 id="paper-theme" className="mb-6 font-serif text-h3">
            Paper
          </h2>
          <FiguresDemo theme="paper" />
        </section>
        <section
          aria-labelledby="blueprint-theme"
          className="blueprint dot-grid p-6 text-graphite sm:p-10"
        >
          <h2 id="blueprint-theme" className="mb-6 font-serif text-h3">
            Blueprint
          </h2>
          <FiguresDemo theme="blueprint" />
        </section>
      </div>
    </main>
  );
}
