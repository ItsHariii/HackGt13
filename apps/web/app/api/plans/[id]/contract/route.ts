import { Address } from "@cartel/acp";
import { AutonomyPreset } from "@cartel/contracts";
import { z } from "zod";
import { jsonResponse, UUID, userId } from "@/lib/catalog";
import { ContractDraftError, draftContract } from "@/lib/contract-draft";
import { logger } from "@/lib/logger";
import { paymentError, sameOrigin } from "@/lib/payment-config";
import { limitCurrentRequest, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.strictObject({
  plan: z.string().regex(/^[A-Z]$/),
  address: Address,
  preset: AutonomyPreset,
  waive: z.array(z.string().min(1).max(64)).max(64).default([]),
});

const STATUS: Record<string, number> = {
  not_found: 404,
  not_solved: 409,
  rule_fails: 409,
  unwaived: 409,
  over_budget: 409,
  changed: 409,
  merchant_unavailable: 503,
  storage: 500,
};

/** Drafts the contract for a solved plan (lib/contract-draft.ts); same work as the draft form. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const { id } = await context.params;
    if (!UUID.test(id)) return jsonResponse({ error: "invalid_plan_id" }, 400);
    const body = Body.safeParse(await request.json().catch(() => null));
    if (!body.success) return jsonResponse({ error: "invalid_request" }, 400);
    const owner = await userId();
    const quota = await limitCurrentRequest("solve");
    if (!quota.allowed) return tooManyRequests(quota.retryAfterMs);
    const versionId = await draftContract({
      planId: id,
      label: body.data.plan,
      owner,
      address: body.data.address,
      preset: body.data.preset,
      waive: body.data.waive,
    });
    return jsonResponse({ versionId, status: "awaiting_signature" }, 201);
  } catch (error) {
    if (error instanceof ContractDraftError)
      return jsonResponse(
        { error: error.code, ...(error.detail ? { rules: error.detail } : {}) },
        STATUS[error.code] ?? 500,
      );
    logger.error({ err: error }, "contract draft failed");
    return paymentError(error);
  }
}
