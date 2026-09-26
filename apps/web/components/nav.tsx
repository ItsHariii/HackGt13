import { ArrowUpRight, ScanLine } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";
export function Nav() {
  return (
    <header className="site-header">
      <Link href="/" className="wordmark" aria-label="ProofCart home">
        <ScanLine size={23} strokeWidth={1.75} aria-hidden="true" />
        ProofCart<span className="wordmark-dot">.</span>
      </Link>
      <nav aria-label="Main navigation">
        <Link href="/#how-it-works" className="nav-secondary">
          How it works
        </Link>
        <ThemeToggle />
        <Link href="/workspace" className="nav-action">
          Your workspace <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </nav>
    </header>
  );
}
