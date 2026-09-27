import { FLAGSHIP_REQUIREMENTS } from "@cartel/contracts/fixtures";
import { homeOffice } from "@cartel/rule-packs";
import { describe, expect, it, vi } from "vitest";
import { productCard, productView } from "./product-view";

vi.mock("server-only", () => ({}));
const { DEMO_NOW, demoProduct, demoSearch } = await import("./demo-catalog");

describe("product page", () => {
  it("Halden shows USB-C power 65 W with a manufacturer receipt and passes the monitor rules", () => {
    const p = demoProduct("dm_halden_m27q");
    if (!p) throw new Error("missing");
    const v = productView(p, FLAGSHIP_REQUIREMENTS, [homeOffice], DEMO_NOW);
    expect(
      v.specs.find((s) => s.field === "monitor.usb_c_pd_watts"),
    ).toMatchObject({
      label: "USB-C power",
      value: "65 W",
      level: "manufacturer",
    });
    expect(v.checks.map((c) => c.status)).toEqual(["pass", "pass", "pass"]);
    expect(v.offers[0]).toMatchObject({ price: "$309.00", tier: "full" });
  });
  it("the 15 W Vireo U2727E fails the USB-C rule", () => {
    const p = demoProduct("dm_vireo_u2727e");
    if (!p) throw new Error("missing");
    const v = productView(p, FLAGSHIP_REQUIREMENTS, [homeOffice], DEMO_NOW);
    expect(v.checks.find((c) => c.status === "fail")?.rule).toBe(
      "Monitor USB-C power ≥ 65 W",
    );
  });
  it("demo search finds monitors and makes cards", () => {
    const found = demoSearch("monitor");
    expect(found.length).toBe(3);
    const card = productCard(found[0] as never, [homeOffice], DEMO_NOW);
    expect(card).toMatchObject({ price: "$309.00", tier: "full" });
  });
  it("cards carry the product photo when there is one", () => {
    const p = demoProduct("dm_vireo_u2727e");
    if (!p) throw new Error("missing");
    const photo = "https://greathub.example/products/vireo-u2727.webp";
    expect(
      productCard({ ...p, imageUrl: photo }, [homeOffice], DEMO_NOW).imageUrl,
    ).toBe(photo);
    expect(
      productCard({ ...p, imageUrl: null }, [homeOffice], DEMO_NOW).imageUrl,
    ).toBeNull();
  });
});
