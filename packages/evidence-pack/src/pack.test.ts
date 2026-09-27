import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type ContractBody, contractHash, reportHash } from "@cartel/contracts";
import {
  createTestAuthenticator,
  FLAGSHIP_CONTRACT_V8,
} from "@cartel/contracts/fixtures";
import { beforeAll, describe, expect, it } from "vitest";
import { utf8 } from "./bytes";
import { chain } from "./ledger";
import {
  buildEvidencePack,
  type EvidencePack,
  type PackInput,
  unzipSync,
} from "./pack";
import { type ReadFile, verifyPack } from "./verify";
import { VERIFY_MJS } from "./verify-script.generated";

const RP = { id: "cartel.example", origin: "https://cartel.example" };

async function fixtureInput(): Promise<PackInput> {
  const draft = { engineVersion: "1.0.0", summary: { hard: { pass: 9 } } };
  const report = { ...draft, hash: await reportHash(draft as never) };
  const contract: ContractBody = {
    ...FLAGSHIP_CONTRACT_V8,
    proof: { ...FLAGSHIP_CONTRACT_V8.proof, reportHash: report.hash },
  };
  const hash = await contractHash(contract);
  const auth = await createTestAuthenticator("ES256");
  const signature = await auth.sign({
    bodyHash: hash,
    origin: RP.origin,
    rpId: RP.id,
  });
  const ledger = await chain(contract.planId, [
    {
      actor: "system",
      type: "proof.completed",
      createdAt: "2026-09-26T14:10:00.000000Z",
      payload: { report: report.hash },
    },
    {
      actor: "user:5f0c7a52-3b8e-4d61-9a2f-1c6e8b4d7a90",
      type: "contract.signed",
      createdAt: "2026-09-26T14:12:50.000000Z",
      payload: { version: 8, bodyHash: hash },
    },
    {
      actor: "merchant:greathub",
      type: "payment.authorized",
      createdAt: "2026-09-26T14:12:55.000000Z",
      payload: { amountMinor: 100 },
    },
  ]);
  return {
    orderId: "CT-TEST-0001",
    generatedAt: "2026-09-26T14:13:00Z",
    contract,
    signature: { ...signature, rp: RP },
    proofReport: report,
    ap2: { intentMandate: {} },
    ledger,
    payment: {
      rail: "simulated",
      status: "authorized",
      amountMinor: 100,
      currency: "USD",
      merchantId: "greathub",
      merchantOrderId: "GH-1",
      authorizedAt: "2026-09-26T14:12:55Z",
    },
    sources: [
      {
        id: "src:greathub/offer",
        type: "fixture",
        url: "https://greathub.example/p/monitor",
        fetchedAt: "2026-09-26T14:10:00Z",
        ext: "json",
        bytes: utf8('{"usb_c_pd_watts":90}\n'),
      },
    ],
    summaryPdf: utf8("%PDF-1.4 test"),
    verifyScript: VERIFY_MJS,
  };
}

const memory =
  (files: ReadonlyMap<string, Uint8Array>): ReadFile =>
  (path) =>
    files.get(path);

function tampered(
  pack: EvidencePack,
  path: string,
  edit: (text: string) => string,
): Map<string, Uint8Array> {
  const files = new Map(pack.files);
  const text = new TextDecoder().decode(files.get(path));
  files.set(path, utf8(edit(text)));
  return files;
}

const failed = async (files: ReadonlyMap<string, Uint8Array>) =>
  (await verifyPack(memory(files))).checks
    .filter((c) => !c.ok)
    .map((c) => c.name);

describe("Evidence Pack", () => {
  let pack: EvidencePack;
  beforeAll(async () => {
    pack = await buildEvidencePack(await fixtureInput());
  });

  it("carries every file the SDD lists", () => {
    expect([...pack.files.keys()].sort()).toEqual([
      "README.txt",
      "ap2-mandates.json",
      "contract.json",
      "contract.sha256",
      "ledger-excerpt.json",
      "manifest.json",
      "payment.json",
      "proof-report.json",
      "signature.json",
      "sources/index.json",
      "sources/src_greathub_offer.json",
      "summary.pdf",
      "verify.mjs",
    ]);
  });

  it("verifies in memory", async () => {
    const report = await verifyPack(memory(pack.files));
    expect(report.checks.map((c) => [c.name, c.ok])).toEqual([
      ["hash", true],
      ["signature", true],
      ["proof", true],
      ["ledger", true],
      ["sources", true],
      ["files", true],
    ]);
    expect(report.contractHash).toBe(pack.contractHash);
  });

  it("is byte-for-byte deterministic", async () => {
    const again = await buildEvidencePack(await fixtureInput());
    // A new test key signs differently, so compare everything but the signature.
    for (const [path, bytes] of pack.files)
      if (
        !["signature.json", "manifest.json", "ap2-mandates.json"].includes(path)
      )
        expect(again.files.get(path), path).toEqual(bytes);
    const same = await buildEvidencePack({
      ...(await fixtureInput()),
      signature: JSON.parse(
        new TextDecoder().decode(pack.files.get("signature.json")),
      ),
    });
    expect(same.sha256).toBe(pack.sha256);
  });

  it("round-trips through the zip", async () => {
    const files = unzipSync(pack.zip);
    const report = await verifyPack((p) => files[p]);
    expect(report.ok).toBe(true);
  });

  it("fails the hash and the signature when contract.json changes", async () => {
    const files = tampered(pack, "contract.json", (t) =>
      t.replace('"maxTotalMinor":', '"maxTotalMinor":9'),
    );
    expect(await failed(files)).toEqual([
      "hash",
      "signature",
      "ledger",
      "files",
    ]);
  });

  it("fails the ledger when an event payload changes", async () => {
    const files = tampered(pack, "ledger-excerpt.json", (t) =>
      t.replace('\\"amountMinor\\": 100', '\\"amountMinor\\": 1'),
    );
    expect(await failed(files)).toEqual(["ledger", "files"]);
  });

  it("fails the sources when a snapshot changes", async () => {
    const files = tampered(pack, "sources/src_greathub_offer.json", (t) =>
      t.replace("90", "15"),
    );
    expect(await failed(files)).toEqual(["sources", "files"]);
  });

  it("fails the proof when the report is swapped", async () => {
    const files = tampered(pack, "proof-report.json", (t) =>
      t.replace('"pass": 9', '"pass": 10'),
    );
    expect(await failed(files)).toEqual(["proof", "files"]);
  });

  it("fails the signature when there is none", async () => {
    const unsigned = await buildEvidencePack({
      ...(await fixtureInput()),
      signature: null,
    });
    expect(await failed(unsigned.files)).toEqual(["signature"]);
  });

  describe("verify.mjs under Node", () => {
    const write = (files: ReadonlyMap<string, Uint8Array>) => {
      const dir = mkdtempSync(join(tmpdir(), "evidence-pack-"));
      for (const [path, bytes] of files) {
        const full = join(dir, path);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, bytes);
      }
      return dir;
    };
    const run = (args: string[]) => {
      try {
        return {
          code: 0,
          out: execFileSync(process.execPath, args, { encoding: "utf8" }),
        };
      } catch (err) {
        const e = err as { status: number; stdout: string };
        return { code: e.status, out: e.stdout };
      }
    };

    it("prints ✓ for each check", () => {
      const dir = write(pack.files);
      const { code, out } = run([join(dir, "verify.mjs")]);
      expect(code).toBe(0);
      for (const name of [
        "hash",
        "signature",
        "proof",
        "ledger",
        "sources",
        "files",
      ])
        expect(out).toMatch(new RegExp(`^✓ ${name}\\b`, "m"));
      expect(out).toContain("All checks passed.");
    });

    it("prints ✗ hash after contract.json is edited", () => {
      const dir = write(
        tampered(pack, "contract.json", (t) => t.replace('"qty":1', '"qty":2')),
      );
      const { code, out } = run([join(dir, "verify.mjs")]);
      expect(code).toBe(1);
      expect(out).toMatch(/^✗ hash\b/m);
    });

    it("checks a zip directly", () => {
      const dir = mkdtempSync(join(tmpdir(), "evidence-zip-"));
      writeFileSync(join(dir, "pack.zip"), pack.zip);
      writeFileSync(join(dir, "verify.mjs"), VERIFY_MJS);
      const { code, out } = run([
        join(dir, "verify.mjs"),
        join(dir, "pack.zip"),
      ]);
      expect(code).toBe(0);
      expect(out).toContain("order CT-TEST-0001");
    });
  });

  it("ships the verify.mjs bundle built from the current source", async () => {
    const { bundle, moduleSource } = await import(
      "../scripts/bundle-verify.mjs"
    );
    const { readFileSync } = await import("node:fs");
    const current = readFileSync(
      new URL("./verify-script.generated.ts", import.meta.url),
      "utf8",
    );
    expect(current).toBe(moduleSource(await bundle()));
  });
});
