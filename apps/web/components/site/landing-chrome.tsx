import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { AccountButton } from "@/components/auth/upgrade-dialog";
import { CartelSeal } from "@/components/brand/wordmark";
import { tornPath } from "@/components/paper/torn";

const LINKS = [
  { href: "/#cast", label: "The Cartel" },
  { href: "/#certainty", label: "How it works" },
  { href: "/explore", label: "Explore" },
  { href: "/trust", label: "Trust" },
];

/** Landing v2 nav: seal and syndicate line, pill nav, Sign in, Start a plan. */
export function LandingNav() {
  return (
    <header className="relative mx-auto flex min-h-[104px] max-w-[1440px] flex-wrap items-center gap-x-7 gap-y-3 px-5 py-4 sm:px-16">
      <Link
        href="/"
        aria-label="Cartel home"
        className="flex items-center gap-3 text-graphite no-underline"
      >
        <CartelSeal size={46} />
        <span className="flex flex-col gap-[3px]">
          <span className="font-bold font-serif text-[32px] leading-[.95] tracking-[-0.035em]">
            Cartel
          </span>
          <span className="font-medium font-mono text-[10.5px] text-muted tracking-[0.2em]">
            SHOPPING SYNDICATE · EST. 2026
          </span>
        </span>
      </Link>
      <div className="flex-1" />
      <nav aria-label="Main" className="hidden lg:block">
        <ul className="flex -rotate-[0.4deg] items-center gap-0.5 rounded-pill border-[1.5px] border-graphite bg-paper-raised p-1 font-medium text-[15px] shadow-[3px_3px_0_0_var(--color-graphite)]">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="flex h-[38px] items-center rounded-pill px-4 text-graphite no-underline hover:bg-highlighter/70"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <span className="font-semibold text-[15px] [&_button]:decoration-2 [&_button]:decoration-red-pen [&_button]:underline [&_button]:underline-offset-[5px]">
        <AccountButton />
      </span>
      <Link
        href="/new"
        className="flex h-12 items-center gap-2.5 rounded-card bg-graphite px-[22px] font-semibold text-[15px] text-paper-raised no-underline shadow-primary hover:opacity-90"
      >
        Start a plan <ArrowRight size={14} aria-hidden="true" />
      </Link>
      <span
        aria-hidden="true"
        className="absolute right-5 bottom-2.5 left-5 border-graphite border-t-[3px] border-double sm:right-16 sm:left-16"
      />
    </header>
  );
}

/** The dark torn footer from Landing v2. */
export function LandingFooter() {
  return (
    <footer
      className="mt-[72px] bg-graphite px-5 pt-[72px] pb-[52px] text-[#d9d2c3] text-[14px] sm:px-16 dark:bg-paper-raised"
      style={{
        clipPath: tornPath(71, {
          depth: 9,
          edges: { top: true },
        }),
      }}
    >
      <div className="mx-auto flex max-w-[1312px] flex-wrap items-center justify-between gap-4">
        <span className="flex items-center gap-2.5 text-paper-raised dark:text-graphite">
          <span className="[&_span]:text-paper-raised dark:[&_span]:text-ink">
            <CartelSeal size={30} />
          </span>
          <span className="font-bold font-serif text-[22px] tracking-[-0.035em]">
            Cartel
          </span>
        </span>
        <span>Demo merchant and sandbox payments. Built at HackGT 13.</span>
        <nav aria-label="Footer" className="flex flex-wrap gap-5">
          {(
            [
              ["/orders", "Orders"],
              ["/mandates", "Mandates"],
              ["/bench", "ProofBench"],
              ["/trust", "How Cartel works"],
            ] as const
          ).map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="text-[#d9d2c3] underline underline-offset-4 hover:text-paper-raised"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
