const CHECKOUT_PATH =
  /^\/plans\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/checkout$/i;

/** A plan's checkout path from `?return=`, or null. Only this exact shape is followed, so it can't redirect off-site. */
export function checkoutReturn(value: unknown): string | null {
  return typeof value === "string" && CHECKOUT_PATH.test(value) ? value : null;
}
