import Link from "next/link";
import { AccountButton } from "./auth/upgrade-dialog";
import { Wordmark } from "./brand/wordmark";

const LINKS = [
  { href: "/explore", label: "Explore" },
  { href: "/workspace", label: "Plans" },
  { href: "/trust", label: "Trust" },
];

/** Site header (Brief and Requirements design): seal, Explore · Plans · Trust. */
export function Nav() {
  return (
    <header className="border-graphite border-b-[3px] border-double bg-paper">
      <div className="flex min-h-[84px] flex-wrap items-center gap-x-10 gap-y-3 px-5 py-3 sm:px-12">
        <Wordmark className="text-[24px]" size={31} />
        <div className="flex-1" />
        <nav aria-label="Main">
          <ul className="flex items-center gap-7 font-medium text-[15px]">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-graphite no-underline underline-offset-4 hover:underline"
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li className="text-[15px]">
              <AccountButton />
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
