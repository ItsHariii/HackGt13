import { ArrowLeft, NotebookPen } from "lucide-react";
import Link from "next/link";
export const metadata = { title: "Your workspace" };
export default function Workspace() {
  return (
    <main className="empty-state">
      <NotebookPen size={44} strokeWidth={1.25} aria-hidden="true" />
      <p className="eyebrow">A fresh page</p>
      <h1>Room for a considered decision.</h1>
      <p>
        Your plans will live here. Planning, evidence, and purchase contracts
        arrive in the next implementation phases.
      </p>
      <Link href="/" className="text-link">
        <ArrowLeft size={16} aria-hidden="true" /> Back to Cartel
      </Link>
    </main>
  );
}
