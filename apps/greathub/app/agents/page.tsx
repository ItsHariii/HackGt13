import type { Metadata } from "next";
import { AgentLog } from "./agent-log";

export const metadata: Metadata = { title: "Agent log" };

export default function AgentsPage() {
  return (
    <main className="page">
      <p className="eyebrow">TRUSTED AGENT PROTOCOL · RFC 9421</p>
      <h1 className="page-title">Agent log</h1>
      <p className="lede">
        Every request to the product API and the ACP checkout must carry an
        Ed25519 HTTP message signature from a key in the agent's JWKS, covering
        the method, authority, path and body digest, valid for at most 8
        minutes, with a nonce we have not seen. Anything else is rejected with
        401 and shows up here.
      </p>
      <AgentLog />
    </main>
  );
}
