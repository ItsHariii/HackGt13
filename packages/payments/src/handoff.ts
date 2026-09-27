import { z } from "zod";

const Minor = z.number().int().nonnegative().safe();
export const UcpCheckout = z.looseObject({
  id: z.string().min(1),
  currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum([
    "incomplete",
    "ready_for_complete",
    "requires_escalation",
    "completed",
    "canceled",
  ]),
  continue_url: z.url(),
  line_items: z.array(
    z.looseObject({
      id: z.string(),
      quantity: z.number().int().positive(),
      item: z.looseObject({
        id: z.string(),
        title: z.string().optional(),
        price: Minor.optional(),
      }),
      totals: z.array(z.looseObject({ type: z.string(), amount: Minor })),
    }),
  ),
  totals: z.array(z.looseObject({ type: z.string(), amount: Minor })),
});
export type UcpCheckout = z.infer<typeof UcpCheckout>;
export interface HandoffOptions {
  origin: string;
  agentProfile: string;
  /** A static token, or a source that renews it (Dev Dashboard credentials). */
  accessToken: string | (() => Promise<string>);
  fetch?: typeof fetch;
}
/** Calls only cart/create/read operations. No complete_checkout tool exists here. */
export class ShopifyHandoffClient {
  constructor(private readonly options: HandoffOptions) {
    const origin = new URL(options.origin);
    if (
      origin.protocol !== "https:" ||
      origin.origin !== options.origin ||
      !options.agentProfile.startsWith("https://")
    )
      throw new Error("invalid_handoff_configuration");
  }
  async create(items: { sku: string; qty: number }[]): Promise<UcpCheckout> {
    const f = this.options.fetch ?? fetch;
    const profile = await f(`${this.options.origin}/.well-known/ucp`, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!profile.ok) throw new Error("ucp_discovery_failed");
    const data = await profile.json();
    const services = data.ucp?.services?.["dev.ucp.shopping"];
    const endpoint = Array.isArray(services)
      ? services.find((s: { transport?: string }) => s.transport === "mcp")
          ?.endpoint
      : null;
    // Server-configured allowlisted origin only, including discovery and redirects.
    if (!endpoint || new URL(endpoint).origin !== this.options.origin)
      throw new Error("ucp_endpoint_rejected");
    const token =
      typeof this.options.accessToken === "string"
        ? this.options.accessToken
        : await this.options.accessToken();
    const call = async (name: string, args: object) => {
      const response = await f(endpoint, {
        method: "POST",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: crypto.randomUUID(),
          method: "tools/call",
          params: {
            name,
            arguments: {
              ...args,
              meta: { "ucp-agent": { profile: this.options.agentProfile } },
            },
          },
        }),
      });
      if (!response.ok) throw new Error("ucp_checkout_unavailable");
      const rpc = await response.json();
      if (rpc.error || rpc.result?.isError)
        throw new Error("ucp_checkout_failed");
      return (
        rpc.result?.structuredContent ??
        JSON.parse(
          rpc.result?.content?.find((c: { type: string }) => c.type === "text")
            ?.text ?? "null",
        )
      );
    };
    const cart = await call("create_cart", {
      cart: {
        line_items: items.map((i) => ({
          item: { id: i.sku },
          quantity: i.qty,
        })),
      },
    });
    if (!cart?.cart?.id) throw new Error("ucp_cart_missing");
    const created = await call("create_checkout", { cart_id: cart.cart.id });
    const checkoutId = created?.id ?? created?.checkout?.id;
    if (!checkoutId) throw new Error("ucp_checkout_missing");
    const read = await call("get_checkout", { id: checkoutId });
    const checkout = UcpCheckout.parse(read.checkout ?? read);
    if (
      new URL(checkout.continue_url).origin !== this.options.origin ||
      checkout.id !== checkoutId
    )
      throw new Error("ucp_redirect_rejected");
    return checkout;
  }
}
