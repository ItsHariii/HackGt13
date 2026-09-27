import type { ContractSignature, Hash } from "@cartel/contracts";
import { canonicalize, reportHash, sha256Hex } from "@cartel/contracts/hash";
import { verifyContractSignature } from "@cartel/contracts/webauthn";
import { fromUtf8 } from "./bytes";
import { type LedgerRecord, verifyChain } from "./ledger";
import {
  type LedgerExcerpt,
  type Manifest,
  PACK_FILES,
  type PackSignature,
  type SourceIndexEntry,
} from "./pack";

/*
 * Offline verification of an Evidence Pack (TASKS T15.2). Pure: it reads
 * files through a callback and uses Web Crypto only, so the same code runs in
 * `verify.mjs` under Node, in tests, and in the browser.
 */

export type CheckName =
  | "hash"
  | "signature"
  | "proof"
  | "ledger"
  | "sources"
  | "files";

export type Check = { name: CheckName; ok: boolean; detail: string };

export type PackReport = {
  ok: boolean;
  orderId: string | null;
  contractHash: Hash | null;
  checks: Check[];
};

export type ReadFile = (path: string) => Uint8Array | undefined;

const short = (h: string) => {
  const hex = h.replace(/^sha256:/, "");
  return `sha256:${hex.slice(0, 12)}…${hex.slice(-6)}`;
};

const hashBytes = async (bytes: Uint8Array): Promise<Hash> =>
  `sha256:${await sha256Hex(bytes)}`;

function json<T>(read: ReadFile, path: string): T | undefined {
  const bytes = read(path);
  if (!bytes) return undefined;
  return JSON.parse(fromUtf8(bytes)) as T;
}

const SIGNATURE_REASONS: Record<string, string> = {
  body_hash_mismatch: "it was made over a different contract hash",
  malformed: "the assertion is malformed",
  wrong_type: "it is not a WebAuthn assertion (webauthn.get)",
  challenge_mismatch: "the signed challenge does not contain this hash",
  wrong_origin: "it was made on a different origin",
  wrong_rp_id: "it was made for a different relying party",
  user_not_present: "the authenticator did not report user presence",
  user_not_verified: "the authenticator did not verify the user",
  unsupported_key: "the public key type is not supported",
  bad_signature: "the signature does not verify with the public key",
};

async function checkHash(read: ReadFile): Promise<{
  check: Check;
  hash: Hash | null;
  contract: Record<string, unknown> | null;
}> {
  const bytes = read(PACK_FILES.contract);
  const stated = read(PACK_FILES.contractHash);
  if (!bytes || !stated)
    return {
      check: {
        name: "hash",
        ok: false,
        detail: `${bytes ? PACK_FILES.contractHash : PACK_FILES.contract} is missing`,
      },
      hash: null,
      contract: null,
    };
  let contract: Record<string, unknown>;
  let hash: Hash;
  try {
    contract = JSON.parse(fromUtf8(bytes));
    hash = `sha256:${await sha256Hex(canonicalize(contract))}`;
  } catch {
    return {
      check: { name: "hash", ok: false, detail: "contract.json is not JSON" },
      hash: null,
      contract: null,
    };
  }
  const expected = fromUtf8(stated).trim();
  const ok = hash === expected;
  return {
    check: {
      name: "hash",
      ok,
      detail: ok
        ? `contract.json hashes to ${short(hash)} (JCS), matching contract.sha256`
        : `contract.json hashes to ${short(hash)} but contract.sha256 says ${short(expected)}`,
    },
    hash,
    contract,
  };
}

async function checkSignature(
  read: ReadFile,
  hash: Hash | null,
): Promise<Check> {
  const sig = json<PackSignature>(read, PACK_FILES.signature);
  if (!sig)
    return {
      name: "signature",
      ok: false,
      detail: "signature.json is missing: this contract was never signed",
    };
  if (!hash)
    return {
      name: "signature",
      ok: false,
      detail: "no contract hash to check the signature against",
    };
  if (!sig.rp?.id || !sig.rp?.origin)
    return {
      name: "signature",
      ok: false,
      detail: "signature.json does not name its relying party",
    };
  const { rp, ...assertion } = sig;
  const result = await verifyContractSignature(assertion as ContractSignature, {
    bodyHash: hash,
    expectedOrigin: rp.origin,
    expectedRpId: rp.id,
  });
  if (!result.ok)
    return {
      name: "signature",
      ok: false,
      detail: `the signature fails: ${SIGNATURE_REASONS[result.reason] ?? result.reason}`,
    };
  return {
    name: "signature",
    ok: true,
    detail: `WebAuthn assertion over ${short(hash)} verifies (${rp.origin}, user ${result.userVerified ? "verified" : "present"})`,
  };
}

async function checkProof(
  read: ReadFile,
  contract: Record<string, unknown> | null,
): Promise<Check> {
  const report = json<{ hash?: string }>(read, PACK_FILES.proof);
  if (!report)
    return { name: "proof", ok: false, detail: "proof-report.json is missing" };
  const computed = await reportHash(report as never);
  if (computed !== report.hash)
    return {
      name: "proof",
      ok: false,
      detail: `proof-report.json hashes to ${short(computed)}, not its stated ${short(String(report.hash))}`,
    };
  const named = (contract?.proof as { reportHash?: string } | undefined)
    ?.reportHash;
  if (named !== computed)
    return {
      name: "proof",
      ok: false,
      detail: `the contract names report ${short(String(named))}, but the pack holds ${short(computed)}`,
    };
  return {
    name: "proof",
    ok: true,
    detail: `proof report ${short(computed)} is the one the contract names`,
  };
}

async function checkLedger(read: ReadFile, hash: Hash | null): Promise<Check> {
  const excerpt = json<LedgerExcerpt>(read, PACK_FILES.ledger);
  if (!excerpt)
    return {
      name: "ledger",
      ok: false,
      detail: "ledger-excerpt.json is missing",
    };
  const records: LedgerRecord[] = excerpt.events.map((e) => ({
    seq: e.seq,
    planId: e.plan_id,
    actor: e.actor,
    type: e.type,
    createdAt: e.created_at,
    payloadText: e.payload_text,
    prevHash: e.prev_hash,
    hash: e.hash,
  }));
  const chain = await verifyChain(records);
  if (!chain.ok)
    return {
      name: "ledger",
      ok: false,
      detail: `the chain breaks at event #${chain.brokenSeq} (${chain.reason})`,
    };
  const signed = records.find((r) => {
    if (r.type !== "contract.signed") return false;
    try {
      const p = JSON.parse(r.payloadText) as Record<string, unknown>;
      return p.bodyHash === hash || p.hash === hash;
    } catch {
      return false;
    }
  });
  if (!signed)
    return {
      name: "ledger",
      ok: false,
      detail: `${records.length} events chain from genesis, but none records signing this contract`,
    };
  return {
    name: "ledger",
    ok: true,
    detail: `${records.length} events chain from genesis; #${signed.seq} contract.signed names this hash`,
  };
}

async function checkSources(read: ReadFile): Promise<Check> {
  const index = json<SourceIndexEntry[]>(read, PACK_FILES.sources);
  if (!index)
    return {
      name: "sources",
      ok: false,
      detail: "sources/index.json is missing",
    };
  for (const s of index) {
    const bytes = read(s.file);
    if (!bytes)
      return { name: "sources", ok: false, detail: `${s.file} is missing` };
    if ((await hashBytes(bytes)) !== s.sha256)
      return {
        name: "sources",
        ok: false,
        detail: `${s.file} does not match its hash in sources/index.json`,
      };
  }
  return {
    name: "sources",
    ok: true,
    detail: `${index.length} source snapshot${index.length === 1 ? "" : "s"} match their hashes`,
  };
}

async function checkFiles(
  read: ReadFile,
  manifest: Manifest | undefined,
): Promise<Check> {
  if (!manifest)
    return { name: "files", ok: false, detail: "manifest.json is missing" };
  const changed: string[] = [];
  for (const f of manifest.files) {
    const bytes = read(f.path);
    if (!bytes || (await hashBytes(bytes)) !== f.sha256) changed.push(f.path);
  }
  if (changed.length)
    return {
      name: "files",
      ok: false,
      detail: `changed or missing since the pack was made: ${changed.join(", ")}`,
    };
  return {
    name: "files",
    ok: true,
    detail: `all ${manifest.files.length} files match manifest.json`,
  };
}

export async function verifyPack(read: ReadFile): Promise<PackReport> {
  let manifest: Manifest | undefined;
  try {
    manifest = json<Manifest>(read, PACK_FILES.manifest);
  } catch {
    manifest = undefined;
  }
  const guard = async (name: CheckName, run: () => Promise<Check>) => {
    try {
      return await run();
    } catch (err) {
      return {
        name,
        ok: false,
        detail: `could not be read (${err instanceof Error ? err.message : String(err)})`,
      } satisfies Check;
    }
  };
  const { check: hashCheck, hash, contract } = await checkHash(read);
  const checks: Check[] = [
    hashCheck,
    await guard("signature", () => checkSignature(read, hash)),
    await guard("proof", () => checkProof(read, contract)),
    await guard("ledger", () => checkLedger(read, hash)),
    await guard("sources", () => checkSources(read)),
    await guard("files", () => checkFiles(read, manifest)),
  ];
  return {
    ok: checks.every((c) => c.ok),
    orderId: manifest?.orderId ?? null,
    contractHash: hash,
    checks,
  };
}

/** The lines `verify.mjs` prints: one per check, ✓ or ✗. */
export function formatReport(report: PackReport): string {
  const width = Math.max(...report.checks.map((c) => c.name.length));
  const lines = [
    `Cartel Evidence Pack${report.orderId ? ` · order ${report.orderId}` : ""}`,
    "",
    ...report.checks.map(
      (c) => `${c.ok ? "✓" : "✗"} ${c.name.padEnd(width)}  ${c.detail}`,
    ),
    "",
    report.ok
      ? "All checks passed."
      : `${report.checks.filter((c) => !c.ok).length} check(s) failed.`,
  ];
  return lines.join("\n");
}
