"use client";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Figure } from "@/components/doodle/figure";

/** A failed request (SDD §17.9): a figure tangled in a cable, and what to do. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <main className="dot-grid min-h-dvh text-graphite">
      <div className="mx-auto flex max-w-[720px] flex-col items-center gap-5 px-5 py-24 text-center">
        <Figure who="scout" pose="tangled" h={128} />
        <p className="font-semibold text-graphite-2 text-meta uppercase tracking-label">
          Something went wrong
        </p>
        <h1 className="font-semibold font-serif text-h2 tracking-heading">
          Let's try that again.
        </h1>
        <p className="text-body text-graphite-2">
          Nothing was bought or signed. Try again; if it keeps happening, reload
          the page.
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center rounded-card bg-graphite px-5 font-semibold text-paper-raised shadow-primary"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
