import { describe, expect, it } from "vitest";
import type { FieldDef } from "./fields";
import { readAs } from "./jsonld";

const RESOLUTION: FieldDef = {
  kind: "enum",
  label: "Resolution",
  values: ["1080p", "1440p", "4k", "5k"],
  aliases: {
    "full hd": "1080p",
    "1920x1080": "1080p",
    qhd: "1440p",
    "2560x1440": "1440p",
    uhd: "4k",
    "3840x2160": "4k",
  },
};

describe("readAs for enums", () => {
  it.each([
    ["4k", "4k"],
    ["UHD", "4k"],
    ["3840x2160", "4k"],
    ["3840 × 2160", "4k"],
    ["2560 × 1440 (QHD)", "1440p"],
    ["3840 x 2160 (4K UHD)", "4k"],
    ["Full HD", "1080p"],
  ])("reads %j as %j", (raw, value) => {
    expect(readAs(raw, RESOLUTION)).toBe(value);
  });

  it("stays unknown when the spellings disagree or nothing matches", () => {
    expect(readAs("2560 × 1440 (4K)", RESOLUTION)).toBeNull();
    expect(readAs("Retina", RESOLUTION)).toBeNull();
  });
});
