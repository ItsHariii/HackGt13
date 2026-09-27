import type { ContractBody, ContractSignature, Hash } from "@cartel/contracts";
import { canonicalize, sha256Hex } from "@cartel/contracts/hash";
import { zipSync } from "fflate";
import { fromUtf8, prettyJson, utf8 } from "./bytes";
import { GENESIS, type LedgerRecord } from "./ledger";

/*
 * The Evidence Pack (SDD §15, TASKS T15.1): one zip that lets anyone re-check
 * a purchase offline. Every file is written deterministically (sorted paths,
 * a fixed timestamp) so the same inputs always produce the same zip and the
 * same sha256.
 */

export const PACK_SCHEMA = "cartel.evidence-pack/1";

/** The files a pack always carries, in the order README.txt lists them. */
export const PACK_FILES = {
  contract: "contract.json",
  contractHash: "contract.sha256",
  signature: "signature.json",
  proof: "proof-report.json",
  ap2: "ap2-mandates.json",
  sources: "sources/index.json",
  ledger: "ledger-excerpt.json",
  payment: "payment.json",
  summary: "summary.pdf",
  verify: "verify.mjs",
  readme: "README.txt",
  manifest: "manifest.json",
} as const;

/** The stored assertion plus the relying party it was made for. */
export type PackSignature = ContractSignature & {
  rp: { id: string; origin: string };
};

export type PackSource = {
  /** Source ID as the facts cite it. */
  id: string;
  type: string;
  url: string | null;
  fetchedAt: string | null;
  /** File extension for the snapshot, e.g. `json` or `html`. */
  ext: string;
  bytes: Uint8Array;
  /** The content hash recorded when the source was fetched, if any. */
  contentHash?: Hash | null;
};

export type PackPayment = {
  rail: string;
  status: string;
  amountMinor: number;
  currency: string;
  merchantId: string;
  merchantOrderId: string;
  authorizedAt: string | null;
  /** The processor's reference. Never a card number. */
  railRef?: string | null;
};

export type PackInput = {
  orderId: string;
  generatedAt: string;
  contract: ContractBody;
  signature: PackSignature | null;
  proofReport: unknown;
  ap2: unknown;
  ledger: readonly LedgerRecord[];
  payment: PackPayment;
  sources: readonly PackSource[];
  summaryPdf: Uint8Array;
  verifyScript: string;
  /** Extra README lines, e.g. that this is demo data. */
  notes?: readonly string[];
};

export type LedgerExcerpt = {
  planId: string;
  genesis: string;
  events: {
    seq: number;
    plan_id: string;
    actor: string;
    type: string;
    created_at: string;
    payload_text: string;
    prev_hash: string;
    hash: string;
  }[];
};

export type SourceIndexEntry = {
  id: string;
  type: string;
  url: string | null;
  fetchedAt: string | null;
  file: string;
  sha256: Hash;
  contentHash: Hash | null;
};

export type Manifest = {
  schema: typeof PACK_SCHEMA;
  orderId: string;
  generatedAt: string;
  contractHash: Hash;
  files: { path: string; sha256: Hash; bytes: number }[];
};

export type EvidencePack = {
  files: Map<string, Uint8Array>;
  zip: Uint8Array;
  /** `sha256:` of the zip bytes, stored in `evidence_packs.sha256`. */
  sha256: Hash;
  contractHash: Hash;
};

const hashBytes = async (bytes: Uint8Array): Promise<Hash> =>
  `sha256:${await sha256Hex(bytes)}`;

/** A file name that is safe inside the zip, whatever the source ID looks like. */
export function sourceFileName(id: string, ext: string): string {
  const safe = id.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 96) || "source";
  const cleanExt = ext.replace(/[^A-Za-z0-9]+/g, "").slice(0, 8) || "bin";
  return `sources/${safe}.${cleanExt}`;
}

export function ledgerExcerpt(
  planId: string,
  records: readonly LedgerRecord[],
): LedgerExcerpt {
  return {
    planId,
    genesis: GENESIS,
    events: records.map((r) => ({
      seq: r.seq,
      plan_id: r.planId,
      actor: r.actor,
      type: r.type,
      created_at: r.createdAt,
      payload_text: r.payloadText,
      prev_hash: r.prevHash,
      hash: r.hash,
    })),
  };
}

function readme(input: PackInput, contractHash: Hash): string {
  const lines = [
    "Cartel Evidence Pack",
    "====================",
    "",
    `Order:          ${input.orderId}`,
    `Contract:       v${input.contract.version} · ${contractHash}`,
    `Generated:      ${input.generatedAt}`,
    "",
    ...(input.notes?.length ? [...input.notes, ""] : []),
    "Verify it yourself (Node 20 or later, no network needed):",
    "",
    "    node verify.mjs",
    "",
    "It re-computes the contract hash, checks the passkey signature over it,",
    "re-hashes the ledger chain and every source snapshot, and prints one",
    "line per check. Edit any file and run it again to watch a check fail.",
    "",
    "Files",
    "-----",
    "contract.json        The signed contract, RFC 8785 (JCS) canonical JSON.",
    "contract.sha256      SHA-256 of contract.json. This is what the passkey signed.",
    "signature.json       The WebAuthn assertion and the public key (JWK).",
    "proof-report.json    The proof report the contract names by hash.",
    "ap2-mandates.json    The same authorization as AP2 Intent and Cart mandates.",
    "sources/             Source snapshots the proof relied on, with hashes in index.json.",
    "ledger-excerpt.json  The plan's hash-chained ledger, payloads verbatim.",
    "payment.json         The payment result. Card numbers are never stored.",
    "summary.pdf          A one-page human summary of all of the above.",
    "verify.mjs           The offline verifier (a single self-contained file).",
    "manifest.json        SHA-256 of every file in this pack.",
    "",
    "What this proves: the person holding the passkey approved exactly this",
    "contract, the payment was checked against it, and none of these files",
    "has changed since. What it does not prove: that a product fits, is",
    "genuine or will arrive. Those are shown as evidence, not promises.",
    "",
  ];
  return lines.join("\n");
}

export async function buildEvidencePack(
  input: PackInput,
): Promise<EvidencePack> {
  const files = new Map<string, Uint8Array>();
  const contractText = canonicalize(input.contract);
  const contractHash: Hash = `sha256:${await sha256Hex(contractText)}`;

  files.set(PACK_FILES.contract, utf8(contractText));
  files.set(PACK_FILES.contractHash, utf8(`${contractHash}\n`));
  if (input.signature)
    files.set(PACK_FILES.signature, prettyJson(input.signature));
  files.set(PACK_FILES.proof, prettyJson(input.proofReport));
  files.set(PACK_FILES.ap2, prettyJson(input.ap2));

  const index: SourceIndexEntry[] = [];
  const used = new Set<string>();
  for (const s of input.sources) {
    let file = sourceFileName(s.id, s.ext);
    for (let n = 2; used.has(file); n++)
      file = sourceFileName(`${s.id}-${n}`, s.ext);
    used.add(file);
    files.set(file, s.bytes);
    index.push({
      id: s.id,
      type: s.type,
      url: s.url,
      fetchedAt: s.fetchedAt,
      file,
      sha256: await hashBytes(s.bytes),
      contentHash: s.contentHash ?? null,
    });
  }
  files.set(PACK_FILES.sources, prettyJson(index));

  files.set(
    PACK_FILES.ledger,
    prettyJson(ledgerExcerpt(input.contract.planId, input.ledger)),
  );
  files.set(PACK_FILES.payment, prettyJson(input.payment));
  files.set(PACK_FILES.summary, input.summaryPdf);
  files.set(PACK_FILES.verify, utf8(input.verifyScript));
  files.set(PACK_FILES.readme, utf8(readme(input, contractHash)));

  const listed = [...files.keys()].sort();
  const manifest: Manifest = {
    schema: PACK_SCHEMA,
    orderId: input.orderId,
    generatedAt: input.generatedAt,
    contractHash,
    files: await Promise.all(
      listed.map(async (path) => {
        const bytes = files.get(path) as Uint8Array;
        return { path, sha256: await hashBytes(bytes), bytes: bytes.length };
      }),
    ),
  };
  files.set(PACK_FILES.manifest, prettyJson(manifest));

  const zip = zipFiles(files);
  return { files, zip, sha256: await hashBytes(zip), contractHash };
}

/** 1980-01-01, the earliest DOS time, so zips don't depend on the clock. */
const ZIP_EPOCH = new Date(1980, 0, 1, 0, 0, 0);

export function zipFiles(files: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const entries: Record<string, [Uint8Array, { mtime: Date; level: 6 | 0 }]> =
    {};
  for (const path of [...files.keys()].sort()) {
    const bytes = files.get(path) as Uint8Array;
    // PDFs are already compressed.
    entries[path] = [
      bytes,
      { mtime: ZIP_EPOCH, level: path.endsWith(".pdf") ? 0 : 6 },
    ];
  }
  return zipSync(entries);
}

/** Reads a stored pack back into files (for tests and the dispute view). */
export { unzipSync } from "fflate";

/** Decodes a text file from a pack, or null when it is missing. */
export function packText(
  files: ReadonlyMap<string, Uint8Array> | Record<string, Uint8Array>,
  path: string,
): string | null {
  const bytes =
    files instanceof Map
      ? files.get(path)
      : (files as Record<string, Uint8Array>)[path];
  return bytes ? fromUtf8(bytes) : null;
}
