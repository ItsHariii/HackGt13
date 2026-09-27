"use client";
import { SlidersHorizontal, X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";

/**
 * The Explore / search layout (Search design, TASKS T10.4): a filter
 * sidebar beside a results grid on wide screens; on phones a two-column
 * grid and a "Filters (n)" button that opens the same filters as a bottom
 * sheet ending in "Show N results". The sheet is a modal <dialog>, so focus
 * is trapped and Esc closes it.
 */
export function ExploreLayout({
  heading,
  status,
  filters,
  activeFilters,
  resultCount,
  children,
  tray,
}: {
  heading: ReactNode;
  /** Per-source search status strip. */
  status?: ReactNode;
  filters: ReactNode;
  activeFilters: number;
  resultCount: number;
  /** The results, usually an <ExploreGrid>. */
  children: ReactNode;
  /** Plan and compare trays, pinned to the bottom. */
  tray?: ReactNode;
}) {
  const sheet = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const filtersId = useId();

  // Close the sheet if the window grows past the phone layout.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => mq.matches && sheet.current?.close();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="mx-auto grid w-full max-w-[1440px] flex-1 grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[272px_minmax(0,1fr)] lg:gap-8 lg:px-10">
        <aside aria-labelledby={filtersId} className="hidden lg:block">
          <h2
            id={filtersId}
            className="mb-3 font-semibold text-meta uppercase tracking-label"
          >
            Filters
          </h2>
          <div className="sticky top-6 flex flex-col gap-5">{filters}</div>
        </aside>
        <main className="flex min-w-0 flex-col gap-4">
          {status}
          <div className="flex flex-wrap items-end justify-between gap-3">
            {heading}
            <button
              type="button"
              onClick={() => sheet.current?.showModal()}
              aria-haspopup="dialog"
              className="inline-flex h-11 items-center gap-2 rounded-card border border-graphite bg-paper-raised px-4 font-semibold text-ui lg:hidden"
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
              Filters{activeFilters > 0 && ` (${activeFilters})`}
            </button>
          </div>
          {children}
        </main>
      </div>
      {tray && <div className="sticky bottom-0 z-10">{tray}</div>}
      <dialog
        ref={sheet}
        aria-labelledby={titleId}
        className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none rounded-t-[16px] border border-graphite bg-paper-raised p-0 text-graphite backdrop:bg-graphite/40 open:flex open:flex-col lg:hidden"
      >
        <div className="flex items-center justify-between border-rule border-b px-4 py-3">
          <span
            aria-hidden="true"
            className="absolute top-1.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-pill bg-rule"
          />
          <h2 id={titleId} className="font-semibold font-serif text-h4">
            Filters
          </h2>
          <button
            type="button"
            onClick={() => sheet.current?.close()}
            aria-label="Close filters"
            className="inline-flex size-11 items-center justify-center rounded-card hover:bg-paper"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-col gap-5 overflow-y-auto px-4 py-4">
          {filters}
        </div>
        <div className="border-rule border-t p-4">
          <button
            type="button"
            onClick={() => sheet.current?.close()}
            className="h-12 w-full rounded-card bg-graphite font-semibold text-paper-raised text-ui shadow-primary"
          >
            Show <span className="num">{resultCount}</span> results
          </button>
        </div>
      </dialog>
    </div>
  );
}

/** Results: two columns on phones, up to four on wide screens. */
export function ExploreGrid({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <ul
      aria-label={label}
      className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 2xl:grid-cols-4 [&>li]:flex [&>li]:min-w-0 [&>li>*]:min-w-0 [&>li>*]:flex-1"
    >
      {children}
    </ul>
  );
}
