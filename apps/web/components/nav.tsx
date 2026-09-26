import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Wordmark } from "./brand/wordmark";
export function Nav() {
  return (
    <header className="site-header">
      <Wordmark className="text-[24px]" size={31} />
      <nav aria-label="Main navigation">
        <Link href="/#how-it-works" className="nav-secondary">
          How it works
        </Link>
        <Link href="/workspace" className="nav-action">
          Your workspace <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </nav>
    </header>
  );
}
