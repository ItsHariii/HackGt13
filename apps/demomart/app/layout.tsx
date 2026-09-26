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
  title: "DemoMart — Test merchant",
  description:
    "A fictional storefront for testing ProofCart. No real purchases.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable}`}>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <div className="test-banner">
          TEST MERCHANT <span>Fictional products. No real purchases.</span>
        </div>
        <header className="merchant-header">
          <Link href="/" className="merchant-logo">
            <Store size={26} aria-hidden="true" />
            demo<span>mart</span>
          </Link>
          <a href="#collection">The collection ↗</a>
        </header>
        <div id="main">{children}</div>
        <footer>
          DemoMart / A ProofCart test merchant{" "}
          <span>All product names and prices are fictional.</span>
        </footer>
      </body>
    </html>
  );
}
