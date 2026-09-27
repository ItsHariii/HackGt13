import type { Metadata } from "next";
import { AgentLog } from "./agent-log";

export const metadata: Metadata = { title: "Harbor Master's Log" };

export default function AgentsPage() {
  return (
    <main className="gh-page gh-harbor">
      <AgentLog />
    </main>
  );
}
