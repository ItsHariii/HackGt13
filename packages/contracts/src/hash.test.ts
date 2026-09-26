import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Fact } from "./catalog";
import {
  FLAGSHIP_REQUIREMENTS,
  VIREO_U2727_DEAL_TRAP_FACTS,
  VIREO_U2727_FACTS,
} from "./fixtures";
import {
  canonicalize,
  factsDigest,
  hashJson,
  reportHash,
  requirementSetHash,
  sha256Hex,
} from "./hash";

// Strings are built from code points so no editor or tool can normalize the
// escapes the vectors depend on.
const cp = (...points: number[]) => String.fromCodePoint(...points);
const BS = cp(0x5c);

describe("canonicalize: RFC 8785 test vectors", () => {
  it("§3.2.2 serializes primitives, strings and numbers canonically", () => {
    const input = JSON.parse(
      `{"numbers": [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001], "literals": [null, true, false]}`,
    );
    // "\u20ac$\u000F\u000aA'\u0042\u0022\u005c\\\"\/" decoded:
    input.string = cp(
      0x20ac,
      0x24,
      0x0f,
      0x0a,
      0x41,
      0x27,
      0x42,
      0x22,
      0x5c,
      0x5c,
      0x22,
      0x2f,
    );
    const expected =
      `{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"` +
      `${cp(0x20ac)}$${BS}u000f${BS}nA'B${BS}"${BS}${BS}${BS}${BS}${BS}"/"}`;
    expect(canonicalize(input)).toBe(expected);
  });

  it("§3.2.3 sorts keys by UTF-16 code units", () => {
    const entries: [string, string][] = [
      [cp(0x20ac), "Euro Sign"],
      [cp(0x0d), "Carriage Return"],
      [cp(0xfb33), "Hebrew Letter Dalet With Dagesh"],
      ["1", "One"],
      [cp(0x1f600), "Emoji: Grinning Face"],
      [cp(0x80), "Control"],
      [cp(0xf6), "Latin Small Letter O With Diaeresis"],
    ];
    const expected =
      `{"${BS}r":"Carriage Return","1":"One","${cp(0x80)}":"Control",` +
      `"${cp(0xf6)}":"Latin Small Letter O With Diaeresis","${cp(0x20ac)}":"Euro Sign",` +
      `"${cp(0x1f600)}":"Emoji: Grinning Face","${cp(0xfb33)}":"Hebrew Letter Dalet With Dagesh"}`;
    expect(canonicalize(Object.fromEntries(entries))).toBe(expected);
  });

  // Appendix B: IEEE 754 bit patterns and their canonical text.
  const numbers: [string, string][] = [
    ["0000000000000000", "0"],
    ["8000000000000000", "0"],
    ["0000000000000001", "5e-324"],
    ["8000000000000001", "-5e-324"],
    ["7fefffffffffffff", "1.7976931348623157e+308"],
    ["ffefffffffffffff", "-1.7976931348623157e+308"],
    ["4340000000000000", "9007199254740992"],
    ["c340000000000000", "-9007199254740992"],
    ["4430000000000000", "295147905179352830000"],
    ["44b52d02c7e14af5", "9.999999999999997e+22"],
    ["44b52d02c7e14af6", "1e+23"],
    ["44b52d02c7e14af7", "1.0000000000000001e+23"],
    ["444b1ae4d6e2ef4e", "999999999999999700000"],
    ["444b1ae4d6e2ef4f", "999999999999999900000"],
    ["444b1ae4d6e2ef50", "1e+21"],
    ["3eb0c6f7a0b5ed8c", "9.999999999999997e-7"],
    ["3eb0c6f7a0b5ed8d", "0.000001"],
    ["41b3de4355555553", "333333333.3333332"],
    ["41b3de4355555554", "333333333.33333325"],
    ["41b3de4355555555", "333333333.3333333"],
    ["41b3de4355555556", "333333333.3333334"],
    ["41b3de4355555557", "333333333.33333343"],
    ["becbf647612f3696", "-0.0000033333333333333333"],
    ["43143ff3c1cb0959", "1424953923781206.2"],
  ];
  it.each(numbers)("number 0x%s → %s", (bits, expected) => {
    const view = new DataView(new ArrayBuffer(8));
    view.setBigUint64(0, BigInt(`0x${bits}`));
    expect(canonicalize(view.getFloat64(0))).toBe(expected);
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["undefined", undefined],
    ["a lone surrogate", "\ud800"],
  ])("rejects %s", (_, value) => {
    expect(() => canonicalize(value)).toThrow();
  });
});

const jsonValue = fc.jsonValue({ maxDepth: 4 });

function shuffleKeys(value: unknown, seed: number): unknown {
  if (Array.isArray(value)) return value.map((v) => shuffleKeys(v, seed));
  if (value === null || typeof value !== "object") return value;
  const entries = Object.entries(value);
  // Deterministic rotation plus reversal gives a different insertion order.
  const k = entries.length === 0 ? 0 : seed % entries.length;
  const reordered = [...entries.slice(k), ...entries.slice(0, k)].reverse();
  return Object.fromEntries(
    reordered.map(([key, v]) => [key, shuffleKeys(v, seed)]),
  );
}

describe("canonicalize: properties", () => {
  it("is stable under key reordering", () => {
    fc.assert(
      fc.property(jsonValue, fc.nat(), (value, seed) => {
        expect(canonicalize(shuffleKeys(value, seed))).toBe(
          canonicalize(value),
        );
      }),
    );
  });

  it("JCS(parse(JCS(x))) = JCS(x) (SDD §22.1 invariant 6)", () => {
    fc.assert(
      fc.property(jsonValue, (value) => {
        const once = canonicalize(value);
        expect(canonicalize(JSON.parse(once))).toBe(once);
      }),
    );
  });

  it("hashJson is stable under key reordering", async () => {
    await fc.assert(
      fc.asyncProperty(jsonValue, fc.nat(), async (value, seed) => {
        expect(await hashJson(shuffleKeys(value, seed))).toBe(
          await hashJson(value),
        );
      }),
      { numRuns: 50 },
    );
  });
});

describe("sha256Hex", () => {
  it("matches FIPS 180-2 vectors", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("hashes UTF-8, not UTF-16", async () => {
    expect(await sha256Hex(cp(0x20ac))).toBe(
      await sha256Hex(new Uint8Array([0xe2, 0x82, 0xac])),
    );
  });
});

describe("factsDigest", () => {
  it("ignores order", async () => {
    expect(await factsDigest([...VIREO_U2727_FACTS].reverse())).toBe(
      await factsDigest(VIREO_U2727_FACTS),
    );
  });

  it("keeps the digest when a refresh returns the same claims", async () => {
    const refreshed: Fact[] = VIREO_U2727_FACTS.map((f) => ({
      ...f,
      id: `${f.id}_r`,
      sourceId: "src_refetch",
      retrievedAt: "2026-09-26T15:00:00Z",
    }));
    expect(await factsDigest(refreshed)).toBe(
      await factsDigest(VIREO_U2727_FACTS),
    );
  });

  it("changes on a same-SKU spec edit (the deal trap)", async () => {
    expect(await factsDigest(VIREO_U2727_DEAL_TRAP_FACTS)).not.toBe(
      await factsDigest(VIREO_U2727_FACTS),
    );
  });

  it("changes when only the evidence state or conflict flag changes", async () => {
    const base = await factsDigest(VIREO_U2727_FACTS);
    const [first, ...rest] = VIREO_U2727_FACTS as [Fact, ...Fact[]];
    expect(
      await factsDigest([{ ...first, state: "estimated" }, ...rest]),
    ).not.toBe(base);
    expect(await factsDigest([{ ...first, conflict: true }, ...rest])).not.toBe(
      base,
    );
  });
});

describe("requirementSetHash", () => {
  it("ignores requirement order", async () => {
    expect(await requirementSetHash([...FLAGSHIP_REQUIREMENTS].reverse())).toBe(
      await requirementSetHash(FLAGSHIP_REQUIREMENTS),
    );
  });
});

describe("reportHash", () => {
  it("excludes the hash field itself", async () => {
    const body = {
      schema: "proofcart.report/1" as const,
      engineVersion: "1.0.0",
      packs: { "home-office": "1.0.0" },
      evaluatedAt: "2026-09-26T14:02:11Z",
      summary: {
        hard: { pass: 0, fail: 0, unknown: 0 },
        preference: { met: 0, unmet: 0, unknown: 0 },
      },
      results: [],
    };
    const h = await reportHash(body);
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(await reportHash({ ...body, hash: h })).toBe(h);
    expect(
      await reportHash({ ...body, evaluatedAt: "2026-09-26T14:02:12Z" }),
    ).not.toBe(h);
  });
});
