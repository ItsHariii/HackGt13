import Link from "next/link";
import { Nav } from "@/components/nav";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Nav />
      {children}
      <footer className="site-footer">
        <span>Cartel · Consider it carefully.</span>
        <Link href="/foundation">Foundation status</Link>
        <span>Built at HackGT 13 / 2026</span>
      </footer>
    </>
  );
}
