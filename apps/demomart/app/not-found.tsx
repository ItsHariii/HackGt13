import Link from "next/link";
export default function NotFound() {
  return (
    <main className="empty-state">
      <p className="eyebrow">404 / Page not found</p>
      <h1>A page out of place.</h1>
      <p>This address doesn’t lead to a page.</p>
      <Link className="primary-link" href="/">
        Back to home
      </Link>
    </main>
  );
}
