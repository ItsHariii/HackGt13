import Link from "next/link";
import { Figure } from "@/components/doodle/figure";
import { Nav } from "@/components/nav";

/** 404 (Edge States #2): the Scout holding its map upside down. */
export default function NotFound() {
  return (
    <>
      <Nav />
      <main className="dot-grid min-h-[70vh] text-graphite">
        <div className="mx-auto flex max-w-[720px] flex-col items-center gap-5 px-5 py-20 text-center">
          <Figure who="scout" pose="map" h={128} />
          <p className="font-semibold text-graphite-2 text-meta uppercase tracking-label">
            404 · Page not found
          </p>
          <h1 className="font-semibold font-serif text-h2 tracking-heading">
            This page wandered off.
          </h1>
          <p className="text-body text-graphite-2">
            The address doesn't lead to a page. It may have moved, or the link
            has a typo.
          </p>
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-card bg-graphite px-5 font-semibold text-paper-raised shadow-primary"
          >
            Back to home
          </Link>
        </div>
      </main>
    </>
  );
}
