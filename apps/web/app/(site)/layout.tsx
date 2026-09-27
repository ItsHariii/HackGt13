import Link from "next/link";
import { Nav } from "@/components/nav";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Nav />
      {children}
      <footer className="border-rule border-t bg-paper">
        <div className="mx-auto flex max-w-[1320px] flex-wrap justify-between gap-4 px-5 py-6 text-muted text-small sm:px-10">
          <span>Demo merchant and sandbox payments. Built at HackGT 13.</span>
          <span className="flex flex-wrap gap-5">
            <Link href="/orders" className="underline underline-offset-4">
              Orders
            </Link>
            <Link href="/mandates" className="underline underline-offset-4">
              Mandates
            </Link>
            <Link href="/bench" className="underline underline-offset-4">
              ProofBench
            </Link>
            <Link href="/trust" className="underline underline-offset-4">
              How Cartel works
            </Link>
            <Link href="/foundation" className="underline underline-offset-4">
              Foundation status
            </Link>
          </span>
        </div>
      </footer>
    </>
  );
}
