import type { ContractItem } from "@cartel/contracts";

/*
 * Delivery match (SDD §15, TASKS T15.3): compare a scanned or typed box
 * barcode with the items the contract approved. GTIN-8, UPC-A (GTIN-12),
 * EAN-13 and GTIN-14 all compare as the same 14-digit number, so a UPC on
 * the box matches an EAN-13 in the contract.
 */

/** Digits only, left-padded to GTIN-14; null when it can't be a GTIN. */
export function normalizeGtin(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  if (![8, 12, 13, 14].includes(digits.length)) return null;
  return digits.padStart(14, "0");
}

/** The GS1 mod-10 check digit holds. */
export function gtinCheckDigitOk(gtin14: string): boolean {
  if (!/^\d{14}$/.test(gtin14)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(gtin14[i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(gtin14[13]);
}

export type DeliveryItem = Pick<
  ContractItem,
  "role" | "sku" | "title" | "qty" | "merchant"
> & { gtin: string | null };

export type DeliveryResult =
  | {
      outcome: "matched";
      gtin: string;
      item: DeliveryItem;
      checkDigitOk: boolean;
    }
  | {
      outcome: "mismatched";
      gtin: string;
      /** Items the contract approved, for "expected one of". */
      expected: DeliveryItem[];
      /** Items that have no GTIN in the contract, so a scan can't confirm them. */
      unscannable: DeliveryItem[];
      checkDigitOk: boolean;
    }
  | { outcome: "invalid"; input: string };

export function deliveryItems(items: readonly ContractItem[]): DeliveryItem[] {
  return items.map((i) => ({
    role: i.role,
    sku: i.sku,
    title: i.title,
    qty: i.qty,
    merchant: i.merchant,
    gtin: i.gtin ? normalizeGtin(i.gtin) : null,
  }));
}

export function matchDelivery(
  items: readonly ContractItem[],
  scanned: string,
): DeliveryResult {
  const gtin = normalizeGtin(scanned);
  if (!gtin) return { outcome: "invalid", input: scanned };
  const all = deliveryItems(items);
  const checkDigitOk = gtinCheckDigitOk(gtin);
  const item = all.find((i) => i.gtin === gtin);
  if (item) return { outcome: "matched", gtin, item, checkDigitOk };
  return {
    outcome: "mismatched",
    gtin,
    expected: all.filter((i) => i.gtin),
    unscannable: all.filter((i) => !i.gtin),
    checkDigitOk,
  };
}

/** The ledger payload for a match. Product identifiers only, never personal data. */
export function deliveryPayload(
  result: Exclude<DeliveryResult, { outcome: "invalid" }>,
  orderId: string,
  method: "scan" | "typed",
): Record<string, string | boolean> {
  return result.outcome === "matched"
    ? {
        orderId,
        gtin: result.gtin,
        sku: result.item.sku,
        role: result.item.role,
        method,
      }
    : {
        orderId,
        gtin: result.gtin,
        method,
        checkDigitOk: result.checkDigitOk,
      };
}
