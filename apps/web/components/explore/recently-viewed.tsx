"use client";
import Link from "next/link";
import { useTrays } from "@/lib/tray-store";

/** Products viewed in this browser, newest first (TASKS T11.15). */
export function RecentlyViewed() {
  const { recent } = useTrays();
  return (
    <section aria-labelledby="recent" className="flex flex-col gap-3">
      <h2 id="recent" className="font-semibold font-serif text-h4">
        Recently viewed
      </h2>
      {recent.length === 0 ? (
        <p className="text-muted text-small">
          Products you open show up here, on this device only.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {recent.map((r) => (
            <li key={r.id}>
              <Link
                href={`/p/${encodeURIComponent(r.id)}`}
                className="inline-flex h-10 items-center gap-2 rounded-pill border border-rule bg-paper-raised px-4 text-small hover:border-graphite"
              >
                {r.name}
                {r.price && <span className="num text-ink">{r.price}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
