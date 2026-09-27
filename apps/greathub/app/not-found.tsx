import Link from "next/link";
import { ErrorScene } from "@/components/gh/error-scene";

export default function NotFound() {
  return (
    <main className="gh-error">
      <div className="gh-error-copy">
        <p className="gh-code gh-muted">404 · page not found</p>
        <h1>Well, blow me down! This page sank.</h1>
        <Link className="gh-btn gh-btn-navy gh-btn-lg" href="/">
          Back to the harbor
        </Link>
      </div>
      <ErrorScene kind="404" />
    </main>
  );
}
