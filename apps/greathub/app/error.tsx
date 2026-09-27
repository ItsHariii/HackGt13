"use client";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { ErrorScene } from "@/components/gh/error-scene";

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
    <main className="gh-error">
      <div className="gh-error-copy">
        <p className="gh-code gh-muted">500 · server error</p>
        <h1>Something&apos;s knotted up.</h1>
        <p>The crew is untangling it. Try again in a moment.</p>
        <button
          type="button"
          className="gh-btn gh-btn-navy gh-btn-lg"
          onClick={reset}
        >
          Try again
        </button>
      </div>
      <ErrorScene kind="500" />
    </main>
  );
}
