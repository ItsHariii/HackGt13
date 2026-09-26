import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import { StampFilter } from "@/components/brand/stamp-filter";
import { Providers } from "@/components/providers";
import "./globals.css";

const sans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});
const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});
const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
});
export const metadata: Metadata = {
  title: {
    default: "Cartel — A little more certain.",
    template: "%s · Cartel",
  },
  description:
    "Clear rules. Evidence you can inspect. A purchase that stays true to what you approved.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${mono.variable} ${serif.variable}`}>
        <Providers>
          <a href="#main" className="skip-link">
            Skip to content
          </a>
          <StampFilter />
          <div id="main">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
