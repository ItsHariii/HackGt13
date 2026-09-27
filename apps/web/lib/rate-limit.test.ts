import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
const { rateSubject, takeRateToken, tooManyRequests, RATE_LIMITS } =
  await import("./rate-limit");

describe("rate limits (T17.2)", () => {
  it("keys signed-in callers by user and others by a hash of their IP", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    expect(rateSubject("u1", h)).toBe("user:u1");
    const ip = rateSubject(null, h);
    expect(ip).toMatch(/^ip:[0-9a-f]{32}$/);
    expect(ip).not.toContain("203.0.113.7");
    expect(rateSubject(null, new Headers({ "x-real-ip": "203.0.113.7" }))).toBe(
      ip,
    );
  });

  it("passes the bucket's limits to the database and honours its answer", async () => {
    const take = vi.fn(async () => ({
      data: [{ allowed: false, retry_after_ms: 1500 }],
      error: null,
    }));
    await expect(takeRateToken("ai", "user:u1", 2, take)).resolves.toEqual({
      allowed: false,
      retryAfterMs: 1500,
    });
    expect(take).toHaveBeenCalledWith({
      p_bucket: "ai",
      p_subject: "user:u1",
      p_capacity: RATE_LIMITS.ai.capacity,
      p_refill_per_s: RATE_LIMITS.ai.refillPerS,
      p_cost: 2,
    });
  });

  it("fails open without a database or when it errors", async () => {
    await expect(takeRateToken("search", "ip:x", 1, null)).resolves.toEqual({
      allowed: true,
    });
    const broken = async () => ({ data: null, error: { message: "down" } });
    await expect(takeRateToken("search", "ip:x", 1, broken)).resolves.toEqual({
      allowed: true,
    });
  });

  it("answers 429 with Retry-After in whole seconds", async () => {
    const r = tooManyRequests(1200);
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("2");
    await expect(r.json()).resolves.toEqual({
      error: "rate_limited",
      retryAfterMs: 1200,
    });
  });
});
