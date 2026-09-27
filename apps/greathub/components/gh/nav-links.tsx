"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Catalog" },
  { href: "/agents", label: "Harbor Master's Log" },
  { href: "/orders", label: "Cargo Manifest" },
  { href: "/chaos", label: "Chaos Deck" },
] as const;

export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="GreatHub" className="gh-nav">
      {LINKS.map((l) => {
        const active =
          l.href === "/"
            ? path === "/" || path.startsWith("/p/")
            : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
