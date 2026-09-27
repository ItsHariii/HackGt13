import type { CheckoutSession } from "@cartel/acp";
import { contractHash } from "@cartel/contracts";
import {
  FLAGSHIP_PACKS,
  FLAGSHIP_T_TRAP,
  FLAGSHIP_T7,
  flagshipStates,
  flagshipV7,
} from "@cartel/rule-packs/fixtures";
import { describe, expect, it, vi } from "vitest";
import {
  type CheckoutContext,
  type CheckoutDeps,
  type Execution,
  executeCheckout,
} from "./checkout-service";

async function setup() {
  const approved = await flagshipV7();
  const context: CheckoutContext = {
    versionId: "version",
    bodyHash: await contractHash(approved.contract),
    approved,
    sessionId: "session",
    merchantId: "greathub",
  };
  const session = {
    id: "session",
    status: "ready_for_payment",
    currency: "USD",
    messages: [],
    x_cartel: {
      contract: {
        contract_id: approved.contract.contractId,
        version: approved.contract.version,
        body_hash: context.bodyHash,
      },
      revision: "1",
    },
  } as unknown as CheckoutSession;
  const execution: Execution = {
    id: "execution",
    status: "started",
    sessionId: "session",
  };
  let consumed = false;
  const deps: CheckoutDeps = {
    packs: FLAGSHIP_PACKS,
    now: () => FLAGSHIP_T7,
    rail: {
      id: "simulated",
      enrollInstrument: vi.fn(),
      prepare: vi.fn(async () => {
        if (consumed) throw new Error("consumed");
        consumed = true;
        return {} as never;
      }),
      credentialFor: vi.fn(async () => ({
        token: "grant",
        provider: "cartel" as const,
      })),
    },
    findExecution: vi.fn(async () => null),
    refresh: vi.fn(async () => ({ session, state: flagshipStates.v7() })),
    getSession: vi.fn(async () => ({
      ok: true as const,
      status: 200,
      requestId: "read",
      data: session,
    })),
    recordProof: vi.fn(async () => "diff"),
    begin: vi.fn(async () => execution),
    complete: vi.fn(async () => ({
      ok: true as const,
      status: 200,
      requestId: "pay",
      data: {
        ...session,
        status: "completed" as const,
        order: {
          id: "order",
          checkout_session_id: "session",
          permalink_url: "https://greathub.example/orders/order",
        },
      },
    })),
    finish: vi.fn(async () => {}),
  };
  return { context, deps, session, execution };
}
describe("guarded checkout", () => {
  it("reproves the flagship happy path before consuming the token and dispatching once", async () => {
    const { context, deps } = await setup();
    expect(await executeCheckout(context, "test-key-0001", deps)).toMatchObject(
      { status: "paid", orderId: "order" },
    );
    expect(deps.recordProof).toHaveBeenCalledOnce();
    expect(deps.rail.prepare).toHaveBeenCalledOnce();
    expect(deps.complete).toHaveBeenCalledOnce();
  });
  it("blocks the same-SKU USB-C trap without beginning or sending payment", async () => {
    const { context, deps, session } = await setup();
    deps.now = () => FLAGSHIP_T_TRAP;
    deps.refresh = vi.fn(async () => ({
      session,
      state: flagshipStates.dealTrap(),
    }));
    expect(await executeCheckout(context, "test-key-0002", deps)).toEqual({
      status: "paused",
      classification: "block",
      diffId: "diff",
    });
    expect(deps.begin).not.toHaveBeenCalled();
    expect(deps.complete).not.toHaveBeenCalled();
  });
  it("reports each guard step as it finishes, and stops at the guard when blocked", async () => {
    const paid = await setup();
    const steps: string[] = [];
    paid.deps.onStep = (step, ms, detail) => {
      expect(ms).toBeGreaterThanOrEqual(0);
      steps.push(detail ? `${step}:${detail}` : step);
    };
    await executeCheckout(paid.context, "test-key-0101", paid.deps);
    expect(steps.map((s) => s.split(":")[0])).toEqual([
      "prove",
      "diff",
      "guard",
      "pay",
      "order",
    ]);
    const trap = await setup();
    trap.deps.now = () => FLAGSHIP_T_TRAP;
    trap.deps.refresh = vi.fn(async () => ({
      session: trap.session,
      state: flagshipStates.dealTrap(),
    }));
    const blocked: string[] = [];
    trap.deps.onStep = (step, _ms, detail) => blocked.push(`${step}:${detail}`);
    await executeCheckout(trap.context, "test-key-0102", trap.deps);
    expect(blocked.at(-1)).toBe("guard:block");
    expect(blocked.some((s) => s.startsWith("pay"))).toBe(false);
  });
  it("timeout stays unresolved; replay reads ACP and never sends a second payment", async () => {
    const { context, deps, execution } = await setup();
    deps.complete = vi.fn(async () => {
      throw new Error("timeout");
    });
    expect(await executeCheckout(context, "test-key-0003", deps)).toMatchObject(
      { status: "reconcile_required" },
    );
    deps.findExecution = vi.fn(async () => execution);
    expect(await executeCheckout(context, "test-key-0003", deps)).toMatchObject(
      { status: "reconcile_required" },
    );
    expect(deps.complete).toHaveBeenCalledOnce();
    expect(deps.getSession).toHaveBeenCalledOnce();
  });
  it("concurrent same-token dispatch charges once", async () => {
    const { context, deps } = await setup();
    const results = await Promise.all([
      executeCheckout(context, "duplicate-key", deps),
      executeCheckout(context, "duplicate-key", deps),
    ]);
    expect(deps.complete).toHaveBeenCalledOnce();
    expect(results.some((r) => r.status === "paid")).toBe(true);
  });
  it("definite decline finishes the execution; same-key replay cannot retry", async () => {
    const { context, deps, session, execution } = await setup();
    deps.complete = vi.fn(async () => ({
      ok: true as const,
      status: 200,
      requestId: "decline",
      data: {
        ...session,
        messages: [
          {
            type: "error" as const,
            code: "payment_declined" as const,
            content_type: "plain" as const,
            content: "Declined",
          },
        ],
      },
    }));
    expect(await executeCheckout(context, "decline-key", deps)).toMatchObject({
      status: "declined" as const,
    });
    expect(deps.finish).toHaveBeenCalledWith(
      execution,
      "declined",
      expect.anything(),
    );
    deps.findExecution = vi.fn(async () => ({
      ...execution,
      status: "declined" as const,
    }));
    expect(await executeCheckout(context, "decline-key", deps)).toMatchObject({
      status: "declined" as const,
    });
    expect(deps.complete).toHaveBeenCalledOnce();
  });
  it("rejects tampered approved bodies and invalid idempotency keys", async () => {
    const { context, deps } = await setup();
    await expect(executeCheckout(context, "", deps)).rejects.toThrow(
      "idempotency_key_invalid",
    );
    context.approved.contract.economics.maxTotalMinor++;
    await expect(executeCheckout(context, "valid-key", deps)).rejects.toThrow(
      "approval_hash_mismatch",
    );
    expect(deps.complete).not.toHaveBeenCalled();
  });
  it("rejects a session from another contract", async () => {
    const { context, deps, session } = await setup();
    if (session.x_cartel?.contract)
      session.x_cartel.contract.body_hash = `sha256:${"0".repeat(64)}`;
    await expect(executeCheckout(context, "valid-key", deps)).rejects.toThrow(
      "session_contract_mismatch",
    );
  });
});
