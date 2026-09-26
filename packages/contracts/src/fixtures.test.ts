import { describe, expect, it } from "vitest";
import { Fact } from "./catalog";
import { ContractBody, ContractSignature } from "./contract";
import {
  FLAGSHIP_BRIEF,
  FLAGSHIP_CONTRACT_V8,
  FLAGSHIP_REQUIREMENTS,
  FLAGSHIP_V8_FACTS,
  FLAGSHIP_V8_SIGNATURE,
  VIREO_U2727_DEAL_TRAP_FACTS,
  VIREO_U2727_FACTS,
} from "./fixtures";
import { contractHash, factsDigest, requirementSetHash } from "./hash";

describe("flagship fixture (SDD §16.1)", () => {
  it("parses as a valid contract body, facts and signature", () => {
    ContractBody.parse(FLAGSHIP_CONTRACT_V8);
    ContractSignature.parse(FLAGSHIP_V8_SIGNATURE);
    for (const f of [
      ...Object.values(FLAGSHIP_V8_FACTS).flat(),
      ...VIREO_U2727_FACTS,
      ...VIREO_U2727_DEAL_TRAP_FACTS,
    ]) {
      Fact.parse(f);
    }
  });

  it("matches the canonical v8 economics: $870.37 delivered, max $885.00", () => {
    const e = FLAGSHIP_CONTRACT_V8.economics;
    expect(e.merchandiseMinor).toBe(79_100);
    expect(e.merchandiseMinor + e.shippingMinor + e.taxEstimateMinor).toBe(
      87_037,
    );
    expect(e.maxTotalMinor).toBe(88_500);
  });

  it("quotes spans that point into the brief", () => {
    for (const r of FLAGSHIP_REQUIREMENTS) {
      if (r.provenance.kind !== "user_stated") continue;
      const [start, end] = r.provenance.span;
      expect(FLAGSHIP_BRIEF.slice(start, end)).toBe(r.provenance.quote);
    }
  });

  it("pins each item's factsDigest to its facts", async () => {
    for (const item of FLAGSHIP_CONTRACT_V8.items) {
      const facts = FLAGSHIP_V8_FACTS[item.role];
      expect(facts, item.role).toBeDefined();
      expect(await factsDigest(facts ?? []), item.role).toBe(item.factsDigest);
    }
  });

  it("pins the requirement-set hash", async () => {
    expect(await requirementSetHash(FLAGSHIP_REQUIREMENTS)).toBe(
      FLAGSHIP_CONTRACT_V8.intent.requirementSetHash,
    );
  });

  it("pins the contract hash the signature covers", async () => {
    expect(await contractHash(FLAGSHIP_CONTRACT_V8)).toBe(
      FLAGSHIP_V8_SIGNATURE.bodyHash,
    );
  });

  it("hashes the parsed body identically to the source object", async () => {
    expect(await contractHash(ContractBody.parse(FLAGSHIP_CONTRACT_V8))).toBe(
      await contractHash(FLAGSHIP_CONTRACT_V8),
    );
  });
});
