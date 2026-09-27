import {
  generateEd25519Jwk,
  type HttpMessage,
  importPublicJwk,
  signingKeyFromEnv,
  signRequest,
  verifyRequest,
} from "@cartel/tap";
import type { AgentScenario } from "./scenario";

/*
 * Agent-request scenarios: the merchant-side policy GreatHub applies to an
 * ACP `complete` call (apps/greathub/lib/agent-auth.ts, SDD §13.3). RFC 9421
 * over @method, @authority, @path and content-digest, tag
 * `agent-payer-auth`, ≤ 8 min window, then a single-use nonce per key (the
 * `record_nonce` table there; a set here).
 */

export type AgentOutcome = { accepted: boolean; reason: string | null };

const URL_ = "https://greathub.example/acp/checkout_sessions/cs_bench/complete";
const BODY = JSON.stringify({
  payment_data: { token: "grant_bench", provider: "cartel" },
});
const NOW = 1_790_000_000;
const KID = "ct-agent-bench";

type Merchant = {
  receive: (
    msg: HttpMessage,
    body: string,
    now: number,
  ) => Promise<AgentOutcome>;
};

async function merchant(): Promise<{
  merchant: Merchant;
  sign: (opts?: {
    created?: number;
    tag?: "agent-payer-auth" | "agent-browser-auth";
    kid?: string;
  }) => Promise<HttpMessage>;
}> {
  const { privateJwk, publicJwk } = await generateEd25519Jwk(KID);
  const publicKey = await importPublicJwk(publicJwk);
  const seen = new Set<string>();
  const receive: Merchant["receive"] = async (msg, body, now) => {
    const result = await verifyRequest(msg, {
      body,
      now,
      allowedTags: ["agent-payer-auth"],
      resolveKey: async (kid) => (kid === KID ? publicKey : null),
    });
    if (!result.ok) return { accepted: false, reason: result.reason };
    const key = `${result.signature.keyId}\u0000${result.signature.nonce}`;
    if (seen.has(key)) return { accepted: false, reason: "nonce_replayed" };
    seen.add(key);
    return { accepted: true, reason: null };
  };
  const sign = async (
    opts: {
      created?: number;
      tag?: "agent-payer-auth" | "agent-browser-auth";
      kid?: string;
    } = {},
  ) => {
    const key = await signingKeyFromEnv(
      JSON.stringify({ ...privateJwk, kid: opts.kid ?? KID }),
    );
    const headers = await signRequest(
      { method: "POST", url: URL_, headers: {} },
      {
        key,
        body: BODY,
        tag: opts.tag ?? "agent-payer-auth",
        created: opts.created ?? NOW,
      },
    );
    return { method: "POST", url: URL_, headers: new Headers(headers) };
  };
  return { merchant: { receive }, sign };
}

export async function runAgentScenario(
  s: AgentScenario,
): Promise<AgentOutcome> {
  const { merchant: m, sign } = await merchant();
  switch (s.attack) {
    case "none":
      return m.receive(await sign(), BODY, NOW + 1);
    case "unsigned":
      return m.receive(
        { method: "POST", url: URL_, headers: new Headers() },
        BODY,
        NOW + 1,
      );
    case "replay_nonce": {
      const msg = await sign();
      const first = await m.receive(msg, BODY, NOW + 1);
      if (!first.accepted) return first;
      return m.receive(msg, BODY, NOW + 2);
    }
    case "tampered_body":
      return m.receive(
        await sign(),
        BODY.replace("grant_bench", "grant_other"),
        NOW + 1,
      );
    case "expired":
      return m.receive(await sign(), BODY, NOW + 301);
    case "unknown_key":
      return m.receive(await sign({ kid: "ct-agent-rogue" }), BODY, NOW + 1);
    case "wrong_tag":
      return m.receive(
        await sign({ tag: "agent-browser-auth" }),
        BODY,
        NOW + 1,
      );
  }
}
