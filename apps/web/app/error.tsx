"use client";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
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
    <main className="empty-state">
      <p className="eyebrow">Something went wrong</p>
      <h1>Let’s try that again.</h1>
      <p>Your next step is a fresh attempt.</p>
      <button type="button" className="primary-link" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
