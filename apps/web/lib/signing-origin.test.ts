import { describe, expect, it } from "vitest";
import { allowedOrigins, matchOrigin } from "./signing-origin";

describe("signing origins", () => {
  it("keeps the configured origin", () => {
    expect(
      allowedOrigins("https://cartel-web.vercel.app", "cartel-web.vercel.app"),
    ).toEqual(["https://cartel-web.vercel.app"]);
  });

  it("allows localhost on several ports for one RP ID", () => {
    const origins = allowedOrigins(
      "http://localhost:3000, http://localhost:3002/,http://localhost:3000",
      "localhost",
    );
    expect(origins).toEqual(["http://localhost:3000", "http://localhost:3002"]);
    expect(matchOrigin("http://localhost:3002", origins)).toBe(
      "http://localhost:3002",
    );
    expect(matchOrigin("http://localhost:3003", origins)).toBeNull();
    expect(matchOrigin(null, origins)).toBeNull();
  });

  it("drops origins the RP ID can't serve, and plain http off localhost", () => {
    expect(
      allowedOrigins(
        "https://cartel-web.vercel.app,https://cartel-web-team.vercel.app,http://cartel-web.vercel.app,https://app.cartel-web.vercel.app,nonsense",
        "cartel-web.vercel.app",
      ),
    ).toEqual([
      "https://cartel-web.vercel.app",
      "https://app.cartel-web.vercel.app",
    ]);
    expect(allowedOrigins(undefined, "localhost")).toEqual([]);
  });
});
