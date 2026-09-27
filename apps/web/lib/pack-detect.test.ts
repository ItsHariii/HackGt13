import { FLAGSHIP_BRIEF } from "@cartel/contracts/fixtures";
import { WEDDING_BRIEF } from "@cartel/rule-packs/fixtures";
import { describe, expect, it } from "vitest";
import { detectPack, TEMPLATES } from "./pack-detect";

describe("detectPack", () => {
  it("finds the pack for each template", () => {
    for (const t of TEMPLATES) expect(detectPack(t.brief)).toBe(t.pack);
  });
  it("keeps the templates in step with the fixtures", () => {
    expect(TEMPLATES[0]?.brief).toBe(FLAGSHIP_BRIEF);
    expect(TEMPLATES[1]?.brief).toBe(WEDDING_BRIEF);
  });
  it("says nothing when unsure", () => {
    expect(detectPack("")).toBeNull();
    expect(detectPack("something nice for my mother")).toBeNull();
    expect(detectPack("a desk and a dress")).toBeNull();
  });
});
