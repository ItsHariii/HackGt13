import { describe, expect, it } from "vitest";
import { inferRoles } from "./roles";

describe("inferRoles", () => {
  it("trusts the category before the title", () => {
    expect(
      inferRoles(
        "Computer Monitors",
        "DELL UltraSharp 27 4K USB-C Hub Monitor",
      ),
    ).toEqual(["monitor"]);
    expect(inferRoles("", "Anker 7-in-1 USB-C Hub")).toEqual(["dock"]);
  });

  it("does not mistake accessories for the thing they attach to", () => {
    expect(inferRoles("Monitor Arms")).toEqual(["monitor_arm"]);
    expect(inferRoles("USB-C to USB-C Cable 100W")).toEqual(["cable"]);
  });

  it("names apparel with the apparel pack's roles", () => {
    expect(inferRoles("Apparel > Shirts", "Linen Shirt")).toEqual(["top"]);
    expect(inferRoles("", "Slim Chinos")).toEqual(["bottom"]);
    expect(inferRoles("", "Wool Blazer")).toEqual(["outerwear"]);
  });

  it("returns no role when nothing matches", () => {
    expect(inferRoles("Garden hose", undefined)).toEqual([]);
  });
});
