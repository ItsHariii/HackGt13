import { FLAGSHIP_CONTRACT_V8 } from "@cartel/contracts/fixtures";
import { describe, expect, it } from "vitest";
import {
  deliveryPayload,
  gtinCheckDigitOk,
  matchDelivery,
  normalizeGtin,
} from "./delivery";
import { buildDisputePacket } from "./dispute";

const items = FLAGSHIP_CONTRACT_V8.items;
const withGtin = items.filter((i) => i.gtin);

describe("normalizeGtin", () => {
  it("pads every GTIN length to 14 digits", () => {
    expect(normalizeGtin("96385074")).toBe("00000096385074");
    expect(normalizeGtin("036000291452")).toBe("00036000291452");
    expect(normalizeGtin("4006381333931")).toBe("04006381333931");
    expect(normalizeGtin("0 0812 3450 0010 8")).toBe("00812345000108");
  });
  it("rejects what can't be a GTIN", () => {
    expect(normalizeGtin("")).toBeNull();
    expect(normalizeGtin("12345")).toBeNull();
    expect(normalizeGtin("ABC123456789")).toBeNull();
  });
  it("checks the GS1 check digit", () => {
    expect(gtinCheckDigitOk("00036000291452")).toBe(true);
    expect(gtinCheckDigitOk("04006381333931")).toBe(true);
    expect(gtinCheckDigitOk("04006381333932")).toBe(false);
  });
});

describe("matchDelivery", () => {
  it("matches a contract item, whatever length the barcode is", () => {
    const item = withGtin[0];
    if (!item?.gtin) throw new Error("fixture has no GTIN");
    const r = matchDelivery(
      items,
      item.gtin.replace(/^0+/, "").padStart(13, "0"),
    );
    expect(r.outcome).toBe("matched");
    if (r.outcome === "matched") expect(r.item.sku).toBe(item.sku);
  });

  it("reports a mismatch with the items it expected", () => {
    const r = matchDelivery(items, "4006381333931");
    expect(r.outcome).toBe("mismatched");
    if (r.outcome === "mismatched") {
      expect(r.gtin).toBe("04006381333931");
      expect(r.expected.length).toBe(withGtin.length);
      expect(r.checkDigitOk).toBe(true);
    }
  });

  it("rejects input that isn't a barcode", () => {
    expect(matchDelivery(items, "hello").outcome).toBe("invalid");
  });

  it("writes ledger payloads with product identifiers only", () => {
    const r = matchDelivery(items, "4006381333931");
    if (r.outcome === "invalid") throw new Error("unexpected");
    expect(deliveryPayload(r, "o-1", "typed")).toEqual({
      orderId: "o-1",
      gtin: "04006381333931",
      method: "typed",
      checkDigitOk: true,
    });
  });
});

describe("buildDisputePacket", () => {
  it("sets approved, facts at purchase and received side by side", () => {
    const first = withGtin[0];
    if (!first?.gtin) throw new Error("fixture has no GTIN");
    const packet = buildDisputePacket({
      orderId: "o-1",
      merchantOrderId: "GH-1",
      merchant: "greathub",
      contract: FLAGSHIP_CONTRACT_V8,
      contractHash: `sha256:${"a".repeat(64)}`,
      signedAt: "2026-09-26T14:12:50Z",
      paidAt: "2026-09-26T14:12:55Z",
      totalMinor: 100,
      factsAtPurchase: [
        {
          sku: first.sku,
          facts: [
            {
              label: "USB-C power",
              value: "90 W",
              state: "verified",
              source: "GreatHub",
              retrievedAt: null,
            },
          ],
        },
      ],
      scans: [
        {
          gtin: first.gtin,
          method: "scan",
          at: "2026-09-29T10:00:00Z",
          ledgerSeq: 14,
        },
        {
          gtin: "4006381333931",
          method: "typed",
          at: "2026-09-29T10:01:00Z",
          ledgerSeq: 15,
        },
      ],
    });
    expect(packet.category).toBe("Merchandise not as described");
    expect(packet.received.map((r) => r.matched?.sku ?? null)).toEqual([
      first.sku,
      null,
    ]);
    expect(packet.missing.map((m) => m.sku)).not.toContain(first.sku);
    expect(packet.findings[0]).toBe(
      `Received GTIN 04006381333931, which is not an item approved in contract v${FLAGSHIP_CONTRACT_V8.version}.`,
    );
    expect(packet.factsAtPurchase[0]?.title).toBe(first.title);
  });
});
