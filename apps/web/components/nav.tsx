import Link from "next/link";
import { AccountButton } from "./auth/upgrade-dialog";
import { Wordmark } from "./brand/wordmark";

const LINKS = [
  { href: "/#cast", label: "The Cartel" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/explore", label: "Explore" },
  { href: "/trust", label: "Trust" },
];

/** Site nav (Landing v2): The Cartel · How it works · Explore · Trust · Sign in · Start a plan. */
export function Nav() {
  return (
    <header className="border-graphite border-b-[3px] border-double bg-paper">
      <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-5 px-5 py-4 sm:px-10 sm:py-5">
        <Wordmark className="text-[24px]" size={31} />
        <nav
          aria-label="Main"
          className="flex items-center gap-5 text-small sm:gap-7"
        >
          <ul className="hidden items-center gap-6 md:flex">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="inline-flex min-h-6 items-center text-graphite underline-offset-4 hover:underline"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <AccountButton />
          <Link
            href="/new"
            className="inline-flex h-10 items-center rounded-card bg-graphite px-4 font-semibold text-paper-raised shadow-primary"
          >
            Start a plan
          </Link>
        </nav>
      </div>
    </header>
  );
}
