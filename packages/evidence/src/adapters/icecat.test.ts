import { fieldDef } from "@cartel/proof-engine";
import { apparel, homeOffice, travel } from "@cartel/rule-packs";
import { describe, expect, it } from "vitest";
import dell from "../__fixtures__/icecat-dell-u2723qe.json";
import viewsonic from "../__fixtures__/icecat-viewsonic-vp2785.json";
import { toDrafts } from "../claims";
import { writeFacts } from "../fact-store";
import { jsonLdClaims } from "../jsonld";
import { json, memoryStore, mockFetch } from "../test-utils";
import {
  createIcecat,
  type IcecatSheet,
  icecatClaims,
  icecatIdentity,
} from "./icecat";

// Live Icecat sheets (2026-09-26), trimmed to identity and features.
const DELL = dell.data as IcecatSheet;
const VIEWSONIC = viewsonic.data as IcecatSheet;
const PACKS = [homeOffice, apparel, travel];

describe("icecatClaims", () => {
  it("reads a USB-C monitor's manufacturer specs as verified where the pack names the manufacturer", () => {
    const by = Object.fromEntries(
      icecatClaims(DELL, { packs: PACKS }).map((c) => [c.field, c]),
    );
    expect(by["monitor.diagonal"]).toMatchObject({
      value: { value: 27, unit: "in" },
      state: "verified",
      extractor: "icecat",
    });
    expect(by["monitor.resolution"]).toMatchObject({
      value: "4k",
      raw: "3840 x 2160 pixels",
      state: "verified",
    });
    expect(by["monitor.usb_c_pd_watts"]).toMatchObject({
      value: { value: 90, unit: "W" },
      raw: "90 W",
      state: "verified",
    });
    expect(by["monitor.video_in"]?.value).toEqual(["hdmi", "dp"]);
  });

  it("infers the role from Icecat's category and reads only that role's fields", () => {
    const fields = icecatClaims(VIEWSONIC, { packs: PACKS }).map(
      (c) => c.field,
    );
    expect(fields.every((f) => f.startsWith("monitor."))).toBe(true);
    // The VP2785-4K lists no USB Power Delivery feature, so there is no PD claim rather than a guess.
    expect(fields).not.toContain("monitor.usb_c_pd_watts");
    expect(fields).not.toContain("desk.width");
  });

  it("extracts identity with every GTIN normalized", () => {
    expect(icecatIdentity(DELL)).toMatchObject({
      brand: "DELL",
      mpn: "DELL-U2723QE",
      gtins: expect.arrayContaining(["00884116415589", "05397184567753"]),
    });
  });
});

describe("seller vs manufacturer", () => {
  it("a seller page that disagrees with the manufacturer is recorded as a conflict", async () => {
    const { store, facts } = memoryStore();
    const defFor = (f: string) => fieldDef(f, PACKS);
    const product = { kind: "product" as const, id: "prod-dell" };
    const retrievedAt = new Date().toISOString();
    await writeFacts(
      store,
      toDrafts(
        icecatClaims(DELL, { packs: PACKS }),
        product,
        { id: "src-icecat", fetchedAt: retrievedAt },
        defFor,
      ),
      { defFor },
    );
    const seller = jsonLdClaims(
      {
        "@type": "Product",
        additionalProperty: [{ name: "USB-C power delivery", value: "65 W" }],
      },
      { packs: PACKS, roles: ["monitor"] },
    );
    const res = await writeFacts(
      store,
      toDrafts(
        seller,
        product,
        { id: "src-page", fetchedAt: retrievedAt },
        defFor,
      ),
      { defFor },
    );
    expect(res.conflicts).toEqual(["product:prod-dell:monitor.usb_c_pd_watts"]);
    const pd = facts.filter((f) => f.field === "monitor.usb_c_pd_watts");
    expect(pd.map((f) => [f.extractor, f.state, f.conflict])).toEqual([
      ["icecat", "verified", true],
      ["jsonld", "source_stated", true],
    ]);
  });
});

describe("Icecat client", () => {
  it("looks up by the 13-digit GTIN, sends the token as a header and keeps it out of the snapshot key", async () => {
    const { store, sources } = memoryStore();
    const { fetch, calls } = mockFetch(() => json(dell));
    const icecat = createIcecat({
      store,
      fetch,
      username: "cartel",
      apiToken: "secret-token",
    });
    const { sheet } = await icecat.byGtin("00884116415589");
    expect(sheet?.GeneralInfo.BrandPartCode).toBe("DELL-U2723QE");
    expect(calls[0]?.url).toBe(
      "https://live.icecat.biz/api?UserName=cartel&Language=en&GTIN=0884116415589",
    );
    expect(calls[0]?.headers.get("api-token")).toBe("secret-token");
    expect(sources[0]?.url).not.toContain("secret-token");
  });

  it("treats an unknown product as no sheet, not an outage", async () => {
    const { fetch } = mockFetch(() =>
      json(
        {
          msg: "Error",
          message:
            "The requested product is not present in the Icecat database",
        },
        { status: 404 },
      ),
    );
    expect(
      (
        await createIcecat({
          store: memoryStore().store,
          fetch,
          username: "u",
        }).byGtin("00812345000016")
      ).sheet,
    ).toBeNull();
  });

  it("refuses to run without a username", () => {
    expect(() =>
      createIcecat({ store: memoryStore().store, username: " " }),
    ).toThrow(/ICECAT_USERNAME/);
  });
});
