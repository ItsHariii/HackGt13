import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("keeps a type-scale size next to a text color", () => {
    expect(cn("text-meta", "text-ink")).toBe("text-meta text-ink");
  });
  it("still merges two sizes", () => {
    expect(cn("text-meta", "text-h4")).toBe("text-h4");
  });
});
