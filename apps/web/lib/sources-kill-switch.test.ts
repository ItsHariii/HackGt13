import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
const { catalogProviders, shopify, transientProduct } = await import(
  "./catalog"
);

/** T17.11: `SOURCES_ENABLED` switches a source off everywhere it is called. */
describe("SOURCES_ENABLED kill switch", () => {
  const before = { ...process.env };
  afterEach(() => {
    process.env = { ...before };
  });

  it("drops switched-off sources from search", () => {
    process.env.SOURCES_ENABLED = "greathub";
    expect(catalogProviders().map((p) => p.source)).toEqual(["greathub"]);
    process.env.SOURCES_ENABLED = "";
    expect(catalogProviders()).toEqual([]);
  });

  it("refuses every Shopify call, including product pages and hand-off", async () => {
    process.env.SOURCES_ENABLED = "greathub,upcitemdb";
    process.env.SHOPIFY_AGENT_PROFILE_URL = "https://agent.example/profile";
    expect(() => shopify(AbortSignal.timeout(1000))).toThrow(/switched off/);
    await expect(
      transientProduct("shopify:gid-1", AbortSignal.timeout(1000)),
    ).resolves.toBeNull();
  });

  it("keeps Shopify when it is enabled", () => {
    process.env.SOURCES_ENABLED = "shopify";
    process.env.SHOPIFY_AGENT_PROFILE_URL = "https://agent.example/profile";
    expect(() => shopify(AbortSignal.timeout(1000))).not.toThrow();
  });
});
