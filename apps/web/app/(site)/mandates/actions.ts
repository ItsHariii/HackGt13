"use server";
import { revalidatePath } from "next/cache";
import { UUID, userId } from "@/lib/catalog";
import { armMandate, cancelMandate, mandateErrorCode } from "@/lib/mandates";

export type MandateActionState = { ok: boolean; error?: string } | null;

/** T14.1: signed -> armed. Only the signed body's trigger and deadline are used. */
export async function armMandateAction(
  _prev: MandateActionState,
  form: FormData,
): Promise<MandateActionState> {
  const versionId = String(form.get("versionId") ?? "");
  if (!UUID.test(versionId)) return { ok: false, error: "invalid_request" };
  try {
    await armMandate(versionId, await userId());
  } catch (error) {
    return { ok: false, error: mandateErrorCode(error) };
  }
  revalidatePath("/mandates");
  return { ok: true };
}

export async function cancelMandateAction(
  _prev: MandateActionState,
  form: FormData,
): Promise<MandateActionState> {
  const mandateId = String(form.get("mandateId") ?? "");
  if (!UUID.test(mandateId)) return { ok: false, error: "invalid_request" };
  try {
    await cancelMandate(mandateId, await userId());
  } catch (error) {
    return { ok: false, error: mandateErrorCode(error) };
  }
  revalidatePath("/mandates");
  return { ok: true };
}
