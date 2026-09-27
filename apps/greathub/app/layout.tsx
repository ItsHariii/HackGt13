import type { Metadata } from "next";
import Link from "next/link";
import { GHDefs } from "@/components/gh/figure";
import { Anchor, PortholeLogo, Search } from "@/components/gh/icons";
import { NavLinks } from "@/components/gh/nav-links";
import { isAdminSession } from "@/lib/admin";
import { code, display, ui } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "GreatHub — Test merchant",
    template: "%s · GreatHub (test merchant)",
  },
  description: "A fictional storefront for testing Cartel. No real purchases.",
  robots: { index: false, follow: false },
};

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await isAdminSession();
  return (
    <html lang="en">
      <body className={`${display.variable} ${ui.variable} ${code.variable}`}>
        <GHDefs />
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <header className="gh-header">
          <Link href="/" className="gh-brand" aria-label="GreatHub home">
            <PortholeLogo />
            <span>GreatHub</span>
          </Link>
          <search className="gh-search">
            <form action="/" className="gh-search-form">
              <Search size={16} />
              <label htmlFor="harbor-search" className="sr-only">
                Search the harbor
              </label>
              <input
                id="harbor-search"
                name="q"
                type="search"
                placeholder="Search the harbor…"
              />
            </form>
          </search>
          <NavLinks />
          <span className={admin ? "gh-pill admin" : "gh-pill"}>
            {admin ? "Captain's quarters · admin" : "TEST MERCHANT"}
          </span>
        </header>
        <div className="gh-banner" role="note">
          <Anchor size={18} />
          <span>
            GreatHub is a test merchant for the Cartel demo. Nothing here ships.
            Not even to the harbor.
          </span>
        </div>
        <div id="main">{children}</div>
        <footer className="gh-footer">
          <Anchor size={16} />
          <span>We yam what we yam: a test merchant. Built at HackGT 13.</span>
          <Link href="/policies">Policies</Link>
        </footer>
      </body>
    </html>
  );
}
