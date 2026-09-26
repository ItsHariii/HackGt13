import type { CheckoutSession, Total } from "./types";

/** The amount of one total line, or null when the merchant didn't send it. */
export function totalAmount(
  session: Pick<CheckoutSession, "totals">,
  type: Total["type"],
): number | null {
  return session.totals.find((t) => t.type === type)?.amount ?? null;
}

/** Error messages on a session, by code. */
export function errorMessages(session: Pick<CheckoutSession, "messages">) {
  return session.messages.filter((m) => m.type === "error");
}
