import { Store } from "lucide-react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const sans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});
export const metadata: Metadata = {
  title: {
    default: "DemoMart — Test merchant",
    template: "%s · DemoMart (test merchant)",
  },
  description:
    "A fictional storefront for testing ProofCart. No real purchases.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable}`}>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <div className="test-banner" role="note">
          TEST MERCHANT <span>Fictional products. No real purchases.</span>
        </div>
        <header className="merchant-header">
          <Link href="/" className="merchant-logo">
            <Store size={26} aria-hidden="true" />
            demo<span>mart</span>
          </Link>
          <nav aria-label="Merchant" className="merchant-nav">
            <Link href="/">Shop</Link>
            <Link href="/agents">Agent log</Link>
            <Link href="/orders">Orders</Link>
            <Link href="/chaos">Chaos Panel</Link>
          </nav>
        </header>
        <div id="main">{children}</div>
        <footer>
          <span>
            DemoMart / A ProofCart test merchant ·{" "}
            <Link href="/policies">Policies</Link>
          </span>
          <span>All product names and prices are fictional.</span>
        </footer>
      </body>
    </html>
  );
}
