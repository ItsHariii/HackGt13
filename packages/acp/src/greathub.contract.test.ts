// ACP contract tests against a running GreatHub (T6.3, T6.5, T6.7, T6.10).
// Opt-in: `node scripts/greathub-contract.mjs` starts GreatHub with ephemeral
// keys and a local JWKS, then runs this file with ACP_CONTRACT_* set.

import { type ContractBody, contractHash } from "@cartel/contracts";
import {
  createTestAuthenticator,
  FLAGSHIP_CONTRACT_V8,
} from "@cartel/contracts/fixtures";
import { mintGrant } from "@cartel/payments";
import { signingKeyFromEnv, signRequest } from "@cartel/tap";
import { beforeAll, describe, expect, it } from "vitest";
import { AcpClient, tapSigner } from "./client";
import { totalAmount } from "./totals";
import { ACP_API_VERSION, type CheckoutSession } from "./types";

const env = process.env;
const base = env.ACP_CONTRACT_BASE_URL ?? "";
const enabled =
  !!base &&
  !!env.ACP_CONTRACT_AGENT_JWK &&
  !!env.ACP_CONTRACT_AGENT2_JWK &&
  !!env.ACP_CONTRACT_GRANT_JWK;

const address = {
  name: "Ada Lovelace",
  line_one: "1 Analytical Way",
  city: "Atlanta",
  state: "GA",
  country: "US",
  postal_code: "30332",
};
const buyer = {
  first_name: "Ada",
  last_name: "Lovelace",
  email: "ada@example.com",
};
const V8_ITEMS = FLAGSHIP_CONTRACT_V8.items.map((i) => ({
  id: i.sku,
  quantity: i.qty,
}));

describe.skipIf(!enabled)("GreatHub ACP contract", () => {
  let agent: Awaited<ReturnType<typeof signingKeyFromEnv>>;
  let grantKey: Awaited<ReturnType<typeof signingKeyFromEnv>>;
  let acp: AcpClient;
  const authenticator = createTestAuthenticator("ES256");

  beforeAll(async () => {
    agent = await signingKeyFromEnv(env.ACP_CONTRACT_AGENT_JWK);
    grantKey = await signingKeyFromEnv(env.ACP_CONTRACT_GRANT_JWK);
    acp = new AcpClient({ baseUrl: base, signer: tapSigner(agent) });
    await admin("/api/chaos/reset");
  });

  async function admin(path: string, body: unknown = {}) {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.ACP_CONTRACT_ADMIN_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    expect(res.status, `${path} → ${res.status}`).toBeLessThan(300);
    return res.json();
  }

  /** Contract v8 for this GreatHub origin, valid for 15 minutes. */
  function contractFor(overrides: Partial<ContractBody> = {}): ContractBody {
    const now = Date.now();
    return {
      ...FLAGSHIP_CONTRACT_V8,
      contractId: `c_contract_test_${now.toString(36)}`,
      merchants: [{ id: "greathub", origin: new URL(base).origin }],
      issuedAt: new Date(now - 1000).toISOString(),
      expiresAt: new Date(now + 15 * 60_000).toISOString(),
      ...overrides,
    };
  }

  async function openSession(contract: ContractBody, items = V8_ITEMS) {
    const res = await acp.createSession({
      items,
      buyer,
      fulfillment_address: address,
      x_cartel: {
        contract: {
          contract_id: contract.contractId,
          version: contract.version,
          body_hash: await contractHash(contract),
        },
      },
    });
    if (!res.ok) throw new Error(`create failed: ${JSON.stringify(res.error)}`);
    return res.data;
  }

  async function paymentFor(
    contract: ContractBody,
    opts: { maxTotalMinor?: number; origin?: string } = {},
  ) {
    const hash = await contractHash(contract);
    const { jws } = await mintGrant(
      {
        iss: env.ACP_CONTRACT_CARTEL_ORIGIN ?? "http://localhost:3000",
        aud: new URL(base).origin,
        sub: contract.subject,
        merchantId: "greathub",
        contractId: contract.contractId,
        contractVersion: contract.version,
        contractHash: hash,
        executionId: crypto.randomUUID(),
        maxTotalMinor: opts.maxTotalMinor ?? contract.economics.maxTotalMinor,
        currency: "USD",
        instrumentRef: env.ACP_CONTRACT_INSTRUMENT ?? "simulated:ok",
      },
      grantKey,
    );
    const signature = await (await authenticator).sign({
      bodyHash: hash,
      origin:
        opts.origin ??
        env.ACP_CONTRACT_WEBAUTHN_ORIGIN ??
        "http://localhost:3000",
      rpId: env.ACP_CONTRACT_RP_ID ?? "localhost",
    });
    return {
      payment_data: { provider: "cartel", token: jws },
      x_cartel: {
        contract: contract as unknown as Record<string, unknown>,
        signature: signature as unknown as Record<string, unknown>,
      },
    };
  }

  describe("TAP verifier (T6.5)", () => {
    it("rejects an unsigned request with 401 and logs it", async () => {
      const res = await fetch(`${base}/acp/checkout_sessions/cs_nope`, {
        headers: {
          "API-Version": ACP_API_VERSION,
          "Request-Id": "contract-unsigned",
        },
      });
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({
        type: "unauthorized",
        code: "missing_signature",
      });
      const log = (await (await fetch(`${base}/api/agents/log`)).json()) as {
        entries: { request_id: string; verdict: string; reason: string }[];
      };
      expect(
        log.entries.find((e) => e.request_id === "contract-unsigned"),
      ).toMatchObject({
        verdict: "rejected",
        reason: "missing_signature",
      });
    });

    it("rejects a replayed nonce", async () => {
      const url = `${base}/api/products/U2727`;
      const headers = await signRequest(
        { method: "GET", url, headers: {} },
        { key: agent, tag: "agent-browser-auth" },
      );
      expect((await fetch(url, { headers })).status).toBe(200);
      const replay = await fetch(url, { headers });
      expect(replay.status).toBe(401);
      expect(await replay.json()).toMatchObject({ code: "nonce_replayed" });
    });

    it("rejects a signature for another path and a payer tag on reads", async () => {
      const signedFor = `${base}/api/products/U2727`;
      const headers = await signRequest(
        { method: "GET", url: signedFor, headers: {} },
        { key: agent, tag: "agent-browser-auth" },
      );
      const other = await fetch(`${base}/api/products/M27Q-USBC`, { headers });
      expect(other.status).toBe(401);
      expect(await other.json()).toMatchObject({ code: "bad_signature" });
      const payer = await signRequest(
        { method: "GET", url: signedFor, headers: {} },
        { key: agent, tag: "agent-payer-auth" },
      );
      expect(
        await (await fetch(signedFor, { headers: payer })).json(),
      ).toMatchObject({ code: "wrong_tag" });
    });

    it("serves signed product facts (T6.2)", async () => {
      const url = `${base}/api/products/U2727`;
      const headers = await signRequest(
        { method: "GET", url, headers: {} },
        { key: agent, tag: "agent-browser-auth" },
      );
      const body = (await (await fetch(url, { headers })).json()) as {
        variants: {
          sku: string;
          gtin: string;
          spec: { name: string; value: string }[];
          offer: { price_minor: number };
        }[];
      };
      expect(body.variants[0]).toMatchObject({
        sku: "U2727",
        gtin: "00812345000030",
        offer: { price_minor: 32900 },
      });
      expect(body.variants[0]?.spec).toContainEqual({
        name: "USB-C power delivery",
        value: "Up to 90 W",
      });
    });
  });

  describe("checkout sessions (T6.3, T6.4)", () => {
    it("requires API-Version 2025-09-12", async () => {
      const res = await fetch(`${base}/acp/checkout_sessions`, {
        method: "POST",
        body: "{}",
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        code: "unsupported_api_version",
      });
    });

    it("prices the flagship basket at $896.05 with x_cartel facts", async () => {
      const res = await acp.createSession({
        items: [
          { id: "BL-CD-465", quantity: 1 },
          { id: "KS-MESH-TASK", quantity: 1 },
          { id: "U2727", quantity: 1 },
          { id: "LOOP-C100-2M", quantity: 1 },
          { id: "PICA-1080", quantity: 1 },
        ],
        buyer,
        fulfillment_address: address,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const s = res.data;
      expect(res.status).toBe(201);
      expect(s.status).toBe("ready_for_payment");
      expect(totalAmount(s, "items_base_amount")).toBe(81500);
      expect(totalAmount(s, "fulfillment")).toBe(2400);
      expect(totalAmount(s, "tax")).toBe(5705);
      expect(totalAmount(s, "fee")).toBe(0);
      expect(totalAmount(s, "total")).toBe(89605);
      expect(s.line_items.reduce((a, l) => a + l.tax, 0)).toBe(5705);
      const monitor = s.line_items.find((l) => l.item.id === "U2727");
      expect(monitor?.item.x_cartel).toMatchObject({
        seller_id: "dm_seller_1",
        gtin: "00812345000030",
        ships_gtin: "00812345000030",
        final_sale: false,
        return_policy: {
          returnable: true,
          windowDays: 30,
          feeMinor: 0,
          finalSale: false,
        },
      });
      expect(monitor?.item.x_cartel?.spec_url).toMatch(
        /\/p\/vireo-u2727\?sku=U2727$/,
      );
    });

    it("is not ready without an address and flags unknown items", async () => {
      const res = await acp.createSession({
        items: [
          { id: "NOPE-1", quantity: 1 },
          { id: "PICA-1080", quantity: 1 },
        ],
      });
      expect(res.ok && res.data.status).toBe("not_ready_for_payment");
      if (!res.ok) return;
      expect(
        res.data.messages.map((m) => m.type === "error" && m.code),
      ).toEqual(expect.arrayContaining(["invalid", "missing"]));
    });

    it("honors Idempotency-Key: replay returns the same session, a different body conflicts", async () => {
      const key = `idem-${crypto.randomUUID()}`;
      const body = { items: [{ id: "PICA-1080", quantity: 1 }] };
      const first = await acp.createSession(body, { idempotencyKey: key });
      const again = await acp.createSession(body, { idempotencyKey: key });
      expect(first.ok && again.ok && again.data.id === first.data.id).toBe(
        true,
      );
      const different = await acp.createSession(
        { items: [{ id: "PICA-1080", quantity: 2 }] },
        { idempotencyKey: key },
      );
      expect(different).toMatchObject({
        ok: false,
        status: 409,
        error: { type: "request_not_idempotent" },
      });
    });

    it("echoes Request-Id and updates, re-reads and cancels a session", async () => {
      const created = await acp.createSession(
        { items: [{ id: "PICA-1080", quantity: 1 }] },
        { requestId: "req-echo-1" },
      );
      expect(created.ok && created.requestId).toBe("req-echo-1");
      if (!created.ok) return;
      const updated = await acp.updateSession(created.data.id, {
        fulfillment_address: address,
        items: [{ id: "PICA-1080", quantity: 2 }],
      });
      expect(updated.ok && updated.data.status).toBe("ready_for_payment");
      expect(updated.ok && totalAmount(updated.data, "items_base_amount")).toBe(
        9800,
      );
      const read = await acp.getSession(created.data.id);
      expect(read.ok && read.data.fulfillment_option_id).toBe("ship_standard");
      const canceled = await acp.cancelSession(created.data.id);
      expect(canceled.ok && canceled.data.status).toBe("canceled");
      const late = await acp.updateSession(created.data.id, {
        items: [{ id: "PICA-1080", quantity: 1 }],
      });
      expect(late).toMatchObject({
        ok: false,
        status: 409,
        error: { code: "session_canceled" },
      });
    });

    it("keeps sessions private to the agent key that opened them", async () => {
      const created = await acp.createSession({
        items: [{ id: "PICA-1080", quantity: 1 }],
      });
      if (!created.ok) throw new Error("create failed");
      const second = new AcpClient({
        baseUrl: base,
        signer: tapSigner(await signingKeyFromEnv(env.ACP_CONTRACT_AGENT2_JWK)),
      });
      expect(await second.getSession(created.data.id)).toMatchObject({
        ok: false,
        status: 404,
      });
    });

    it("refuses agent requests signed with the grant key", async () => {
      const url = `${base}/api/products/U2727`;
      const headers = await signRequest(
        { method: "GET", url, headers: {} },
        { key: grantKey, tag: "agent-browser-auth" },
      );
      const res = await fetch(url, { headers });
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ code: "unknown_key" });
    });
  });

  describe("Chaos Panel mutations are visible within 1 s (T6.10)", () => {
    it("deal trap: same SKU, $319 and 15 W, on the product API and the ACP GET", async () => {
      const session = await openSession(contractFor(), [
        { id: "U2727", quantity: 1 },
      ]);
      await admin("/api/chaos/scenarios/flagship-deal-trap");
      const started = Date.now();
      const read = await acp.getSession(session.id);
      expect(Date.now() - started).toBeLessThan(1000);
      expect(read.ok && read.data.line_items[0]?.base_amount).toBe(31900);
      const url = `${base}/api/products/U2727`;
      const headers = await signRequest(
        { method: "GET", url, headers: {} },
        { key: agent, tag: "agent-browser-auth" },
      );
      const facts = (await (await fetch(url, { headers })).json()) as {
        variants: { spec: { name: string; value: string }[] }[];
      };
      expect(facts.variants[0]?.spec).toContainEqual({
        name: "USB-C power delivery",
        value: "15 W",
      });
      const page = await (await fetch(`${base}/p/vireo-u2727`)).text();
      expect(page).toContain('"value":"15 W"');
      expect(page).toContain('"price":"319.00"');
      await admin("/api/chaos/reset");
      const restored = await acp.getSession(session.id);
      expect(restored.ok && restored.data.line_items[0]?.base_amount).toBe(
        32900,
      );
    });
  });

  describe("/complete (T6.7, T6.8, T6.9)", () => {
    it("verifies grant, contract and passkey, charges once and records the order", async () => {
      const contract = contractFor();
      const session = await openSession(contract);
      expect(totalAmount(session, "total")).toBe(87465); // v8 items, webcam still $49
      const key = `complete-${crypto.randomUUID()}`;
      const body = await paymentFor(contract);
      const done = await acp.completeSession(session.id, body, {
        idempotencyKey: key,
      });
      if (!done.ok) throw new Error(JSON.stringify(done.error));
      expect(done.data.status).toBe("completed");
      expect(done.data.order?.id).toMatch(/^dm_ord_/);
      const replay = await acp.completeSession(session.id, body, {
        idempotencyKey: key,
      });
      expect(replay.ok && replay.data.order?.id).toBe(done.data.order?.id);
      const second = await acp.completeSession(
        session.id,
        await paymentFor(contract),
        { idempotencyKey: `x-${key}` },
      );
      expect(second).toMatchObject({
        ok: false,
        status: 409,
        error: { code: "session_completed" },
      });

      // Completed sessions are frozen: a later mutation does not rewrite them.
      await admin("/api/chaos/mutations", {
        mutation: "price_raise",
        sku: "M27Q-USBC",
        params: { priceMinor: 39900 },
      });
      const frozen = await acp.getSession(session.id);
      expect(frozen.ok && totalAmount(frozen.data, "total")).toBe(87465);
      await admin("/api/chaos/reset");

      if (env.ACP_CONTRACT_EVENTS_URL) {
        const deadline = Date.now() + 5000;
        let events: { type: string; data: { order_id: string } }[] = [];
        while (Date.now() < deadline) {
          events = (await (
            await fetch(env.ACP_CONTRACT_EVENTS_URL)
          ).json()) as typeof events;
          if (events.some((e) => e.data.order_id === done.data.order?.id))
            break;
          await new Promise((r) => setTimeout(r, 200));
        }
        expect(
          events.find((e) => e.data.order_id === done.data.order?.id),
        ).toMatchObject({ type: "order_created" });
      }
    });

    async function attempt(
      mutate: (
        c: ContractBody,
      ) => Promise<{ body: unknown; sessionItems?: typeof V8_ITEMS }>,
    ) {
      const contract = contractFor();
      const { body, sessionItems } = await mutate(contract);
      const session = await openSession(contract, sessionItems);
      return acp.completeSession(session.id, body as never);
    }

    it.each([
      [
        "a grant below the live total",
        async (c: ContractBody) => ({
          body: await paymentFor(c, { maxTotalMinor: 80000 }),
        }),
        422,
        "grant_amount_exceeds_grant",
      ],
      [
        "a contract edited after signing",
        async (c: ContractBody) => {
          const body = await paymentFor(c);
          (
            body.x_cartel.contract as {
              economics: { maxTotalMinor: number };
            }
          ).economics.maxTotalMinor = 99900;
          return { body };
        },
        403,
        "grant_contract_mismatch",
      ],
      [
        "a passkey signature from another origin",
        async (c: ContractBody) => ({
          body: await paymentFor(c, { origin: "https://evil.example" }),
        }),
        403,
        "signature_wrong_origin",
      ],
      [
        "a cart that differs from the contract",
        async (c: ContractBody) => ({
          body: await paymentFor(c),
          sessionItems: V8_ITEMS.slice(0, 4),
        }),
        409,
        "contract_mismatch",
      ],
    ] as const)(
      "refuses %s without charging",
      async (_name, mutate, status, code) => {
        const res = await attempt(mutate);
        expect(res).toMatchObject({ ok: false, status, error: { code } });
      },
    );

    it("refuses a same-SKU substitution (variant swap) at the merchant", async () => {
      await admin("/api/chaos/mutations", {
        mutation: "variant_swap",
        sku: "M27Q-USBC",
        params: { toSku: "U2727" },
      });
      try {
        const contract = contractFor();
        const session = await openSession(contract);
        const res = await acp.completeSession(
          session.id,
          await paymentFor(contract),
        );
        expect(res).toMatchObject({
          ok: false,
          status: 409,
          error: { code: "item_substituted" },
        });
      } finally {
        await admin("/api/chaos/reset");
      }
    });

    it("rejects /complete signed with the browser tag", async () => {
      const contract = contractFor();
      const session: CheckoutSession = await openSession(contract);
      const url = `${base}/acp/checkout_sessions/${session.id}/complete`;
      const text = JSON.stringify(await paymentFor(contract));
      const headers = await signRequest(
        { method: "POST", url, headers: {} },
        { key: agent, body: text, tag: "agent-browser-auth" },
      );
      const res = await fetch(url, {
        method: "POST",
        body: text,
        headers: {
          ...headers,
          "API-Version": ACP_API_VERSION,
          "Idempotency-Key": crypto.randomUUID(),
          "content-type": "application/json",
        },
      });
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ code: "wrong_tag" });
    });
  });
});
