import "server-only";
import {
  type ContractBody,
  type ContractSignature,
  type Hash,
  type ProofReport,
  signingChallenge,
  toAp2,
} from "@cartel/contracts";
import { canonicalize, contractHash, sha256Hex } from "@cartel/contracts/hash";
import {
  buildDisputePacket,
  buildEvidencePack,
  type DisputePacket,
  type DisputeScan,
  type EvidencePack,
  type ItemFacts,
  type LedgerRecord,
  type PackPayment,
  type PackSignature,
  type PackSource,
  VERIFY_MJS,
} from "@cartel/evidence-pack";
import {
  type CheckoutState,
  fieldDef,
  formatMoneyText,
  formatValue,
  type Pack,
} from "@cartel/proof-engine";
import { PACKS } from "@cartel/rule-packs";
import { FLAGSHIP_PACKS } from "@cartel/rule-packs/fixtures";
import { cache } from "react";
import { formatStamp } from "./contract-view";
import { FLAGSHIP_ORDER, flagshipLedger, flagshipStory } from "./flagship";
import { ledgerRecord } from "./ledger-row";
import { renderPackSummary } from "./pdf/summary";
import { coseToJwk } from "./signing-service";
import { createAdminClient } from "./supabase/admin";

/*
 * Post-purchase records (SDD §15, TASKS T15.1–T15.4). One model of a paid
 * order feeds the Evidence Pack, the delivery match and the dispute packet,
 * whether the order is the flagship demo (fixtures) or a stored order
 * (loaded with the secret key after the route has checked ownership).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALL_PACKS = Object.values(PACKS);

export const EVIDENCE_PACK_BUCKET = "evidence-packs";
export const EVIDENCE_PACK_QUEUE = "q_evidence_pack";

export type OrderRecord = {
  /** The id in `/orders/[id]`. */
  orderId: string;
  merchant: string;
  merchantOrderId: string;
  planId: string;
  userId: string | null;
  contract: ContractBody;
  contractHash: Hash;
  signature: PackSignature | null;
  signedAt: string | null;
  report: ProofReport | null;
  /** The checkout the contract was approved against: the facts at purchase. */
  snapshot: CheckoutState | null;
  snapshotHash: Hash | null;
  ledger: LedgerRecord[];
  payment: PackPayment;
  sources: PackSource[];
  packs: readonly Pack[];
  demo: boolean;
};

const DEMO_NOTES = [
  "Demo plan: built from Cartel's flagship fixtures. The signature is made with Cartel's published demo key (seed: sha256 of \"cartel-demo-signing-key\"), not a person's passkey, so it proves the files are intact, not who approved them.",
];

const utf8 = (text: string) => new TextEncoder().encode(text);
const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const fromHex = (value: string) =>
  new Uint8Array(Buffer.from(value.replace(/^\\x/, ""), "hex"));

/* ------------------------------------------------------------------ demo */

const DEMO_RP = { id: "cartel.demo", origin: "https://cartel.demo" } as const;

/**
 * A real WebAuthn-shaped assertion over contract v8, made with a fixed
 * Ed25519 demo key so the demo pack verifies end to end.
 */
async function demoSignature(
  bodyHash: Hash,
  signedAt: string,
): Promise<PackSignature> {
  const seed = new Uint8Array(
    Buffer.from(await sha256Hex("cartel-demo-signing-key"), "hex"),
  );
  const pkcs8 = new Uint8Array([
    ...Buffer.from("302e020100300506032b657004220420", "hex"),
    ...seed,
  ]);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "Ed25519" },
    true,
    ["sign"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", key);
  const challenge = signingChallenge(bodyHash, "flagship-demo-v8");
  const clientDataJSON = utf8(
    JSON.stringify({
      type: "webauthn.get",
      challenge: b64url(utf8(challenge)),
      origin: DEMO_RP.origin,
      crossOrigin: false,
    }),
  );
  const rpIdHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", utf8(DEMO_RP.id)),
  );
  // rpIdHash ‖ flags (user present + user verified) ‖ sign count 0.
  const authData = new Uint8Array([...rpIdHash, 0x05, 0, 0, 0, 0]);
  const clientHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", clientDataJSON),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "Ed25519",
      key,
      new Uint8Array([...authData, ...clientHash]),
    ),
  );
  return {
    bodyHash,
    credentialId: b64url(utf8("cartel-demo-key")),
    authenticatorData: b64url(authData),
    clientDataJSON: b64url(clientDataJSON),
    signature: b64url(signature),
    publicKeyJwk: { kty: "OKP", crv: "Ed25519", x: jwk.x },
    signedAt,
    rp: { ...DEMO_RP },
  };
}

function factSources(
  facts: CheckoutState["facts"],
  type: string,
): PackSource[] {
  const bySource = new Map<string, CheckoutState["facts"][number][]>();
  for (const f of facts) {
    const list = bySource.get(f.sourceId) ?? [];
    list.push(f);
    bySource.set(f.sourceId, list);
  }
  return [...bySource.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, list]) => ({
      id,
      type,
      url: null,
      fetchedAt: list.map((f) => f.retrievedAt).sort()[list.length - 1] ?? null,
      ext: "json",
      bytes: utf8(canonicalize({ sourceId: id, facts: list })),
    }));
}

async function snapshotSource(
  state: CheckoutState,
  fetchedAt: string | null,
  contentHash: Hash | null,
): Promise<PackSource> {
  const text = canonicalize(state);
  return {
    id: "checkout-snapshot",
    type: "acp_checkout",
    url: null,
    fetchedAt,
    ext: "json",
    bytes: utf8(text),
    contentHash: contentHash ?? `sha256:${await sha256Hex(text)}`,
  };
}

export const flagshipOrderRecord = cache(async (): Promise<OrderRecord> => {
  const [s, rows] = await Promise.all([flagshipStory(), flagshipLedger()]);
  const contract = s.v8.contract;
  const last = (type: string) =>
    [...rows].reverse().find((r) => r.type === type);
  const signed = last("contract.signed");
  const paid = last("payment.authorized");
  const signedAt = signed?.createdAt.replace(/\.\d+Z$/, "Z") ?? null;
  const e = contract.economics;
  const total = e.merchandiseMinor + e.shippingMinor + e.taxEstimateMinor;
  return {
    orderId: FLAGSHIP_ORDER,
    merchant: "GreatHub (test merchant)",
    merchantOrderId: FLAGSHIP_ORDER,
    planId: contract.planId,
    userId: null,
    contract,
    contractHash: s.v8Hash as Hash,
    signature: await demoSignature(
      s.v8Hash as Hash,
      signedAt ?? contract.issuedAt,
    ),
    signedAt,
    report: s.v8.report,
    snapshot: s.v8.snapshot,
    snapshotHash: null,
    ledger: rows.map(
      ({
        seq,
        planId,
        actor,
        type,
        createdAt,
        payloadText,
        prevHash,
        hash,
      }) => ({
        seq,
        planId,
        actor,
        type,
        createdAt,
        payloadText,
        prevHash,
        hash,
      }),
    ),
    payment: {
      rail: "visa_acceptance (sandbox)",
      status: "authorized",
      amountMinor: total,
      currency: e.currency,
      merchantId: "greathub",
      merchantOrderId: FLAGSHIP_ORDER,
      authorizedAt: paid?.createdAt.replace(/\.\d+Z$/, "Z") ?? null,
      railRef: null,
    },
    sources: [
      await snapshotSource(s.v8.snapshot, contract.issuedAt, null),
      ...factSources(s.v8.snapshot.facts, "fixture"),
    ],
    packs: FLAGSHIP_PACKS,
    demo: true,
  };
});

/* ---------------------------------------------------------------- stored */

type AdminDb = ReturnType<typeof createAdminClient>;

function must<T>(
  r: { data: T; error: { message: string } | null },
  what: string,
): NonNullable<T> {
  if (r.error || r.data === null || r.data === undefined)
    throw new Error(`${what}: ${r.error?.message ?? "not found"}`);
  return r.data as NonNullable<T>;
}

function rpFromClientData(clientDataJSON: Uint8Array) {
  const env = process.env;
  try {
    const origin = env.WEBAUTHN_ORIGIN
      ? new URL(env.WEBAUTHN_ORIGIN).origin
      : new URL(
          (
            JSON.parse(Buffer.from(clientDataJSON).toString("utf8")) as {
              origin: string;
            }
          ).origin,
        ).origin;
    return { id: env.WEBAUTHN_RP_ID || new URL(origin).hostname, origin };
  } catch {
    return { id: env.WEBAUTHN_RP_ID ?? "", origin: env.WEBAUTHN_ORIGIN ?? "" };
  }
}

const MAX_SOURCES = 40;
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

async function storedSources(
  db: AdminDb,
  snapshot: { state: CheckoutState; hash: Hash; fetchedAt: string } | null,
): Promise<PackSource[]> {
  if (!snapshot) return [];
  const out: PackSource[] = [
    await snapshotSource(snapshot.state, snapshot.fetchedAt, snapshot.hash),
  ];
  const ids = [...new Set(snapshot.state.facts.map((f) => f.sourceId))]
    .filter((id) => UUID.test(id))
    .slice(0, MAX_SOURCES);
  if (!ids.length)
    return [...out, ...factSources(snapshot.state.facts, "facts")];
  const { data } = await db
    .from("sources")
    .select(
      "id,url,source_type,content_hash,content_type,storage_path,fetched_at",
    )
    .in("id", ids);
  for (const row of (data ?? []).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    let bytes: Uint8Array | null = null;
    let ext = "json";
    if (row.storage_path) {
      const file = await db.storage.from("sources").download(row.storage_path);
      if (file.data && file.data.size <= MAX_SOURCE_BYTES) {
        bytes = new Uint8Array(await file.data.arrayBuffer());
        ext = row.storage_path.split(".").pop() ?? "bin";
      }
    }
    out.push({
      id: row.id,
      type: row.source_type,
      url: row.url,
      fetchedAt: row.fetched_at,
      ext,
      // Without the raw bytes, keep the facts this source gave, so the pack still says what it claimed.
      bytes:
        bytes ??
        utf8(
          canonicalize({
            sourceId: row.id,
            note: "raw snapshot not stored; facts as recorded",
            facts: snapshot.state.facts.filter((f) => f.sourceId === row.id),
          }),
        ),
      contentHash: row.content_hash as Hash,
    });
  }
  return out;
}

/** A stored order with everything the pack needs, read with the secret key. */
export async function storedOrderRecord(
  orderId: string,
  db: AdminDb = createAdminClient(),
): Promise<OrderRecord | null> {
  if (!UUID.test(orderId)) return null;
  const order = await db
    .from("orders")
    .select(
      "id,merchant_id,merchant_order_id,total_minor,currency,execution_id,created_at",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order.data) return null;
  const o = order.data;
  const exec = must(
    await db
      .from("payment_executions")
      .select(
        "id,contract_version_id,rail,status,amount_minor,currency,rail_ref,completed_at",
      )
      .eq("id", o.execution_id)
      .single(),
    "execution",
  );
  const version = must(
    await db
      .from("contract_versions")
      .select("id,plan_id,body,body_hash,proof_report_id,signed_at")
      .eq("id", exec.contract_version_id)
      .single(),
    "contract version",
  );
  const [plan, sigRow, report, snap, ledger] = await Promise.all([
    db.from("plans").select("user_id").eq("id", version.plan_id).single(),
    db
      .from("contract_signatures")
      .select(
        "credential_id,credential_public_key,body_hash,authenticator_data,client_data_json,signature,created_at",
      )
      .eq("contract_version_id", version.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    version.proof_report_id
      ? db
          .from("proof_reports")
          .select("report")
          .eq("id", version.proof_report_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from("checkout_snapshots")
      .select("state,state_hash,fetched_at")
      .eq("contract_version_id", version.id)
      .lte("fetched_at", exec.completed_at ?? o.created_at)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("ledger_events")
      .select("seq,plan_id,actor,type,created_at,payload,prev_hash,hash")
      .eq("plan_id", version.plan_id)
      .order("seq"),
  ]);

  let signature: PackSignature | null = null;
  const sig = sigRow.data;
  if (sig) {
    const cred = sig.credential_id
      ? await db
          .from("signing_credentials")
          .select("credential_id")
          .eq("id", sig.credential_id)
          .maybeSingle()
      : { data: null };
    const clientData = fromHex(sig.client_data_json);
    const assertion: ContractSignature = {
      bodyHash: sig.body_hash as Hash,
      credentialId: cred.data?.credential_id ?? "unknown",
      authenticatorData: b64url(fromHex(sig.authenticator_data)),
      clientDataJSON: b64url(clientData),
      signature: b64url(fromHex(sig.signature)),
      publicKeyJwk: coseToJwk(fromHex(sig.credential_public_key)),
      signedAt: new Date(version.signed_at ?? sig.created_at).toISOString(),
    };
    signature = { ...assertion, rp: rpFromClientData(clientData) };
  }

  const snapshot = snap.data
    ? {
        state: snap.data.state as unknown as CheckoutState,
        hash: snap.data.state_hash as Hash,
        fetchedAt: snap.data.fetched_at,
      }
    : null;
  const contract = version.body as unknown as ContractBody;
  return {
    orderId: o.id,
    merchant:
      o.merchant_id === "greathub" ? "GreatHub (test merchant)" : o.merchant_id,
    merchantOrderId: o.merchant_order_id,
    planId: version.plan_id,
    userId: plan.data?.user_id ?? null,
    contract,
    contractHash: (await contractHash(contract)) as Hash,
    signature,
    signedAt: signature?.signedAt ?? null,
    report: (report.data?.report as unknown as ProofReport) ?? null,
    snapshot: snapshot?.state ?? null,
    snapshotHash: snapshot?.hash ?? null,
    ledger: (ledger.data ?? []).map(ledgerRecord),
    payment: {
      rail: exec.rail ?? "unknown",
      status: exec.status,
      amountMinor: exec.amount_minor,
      currency: exec.currency,
      merchantId: o.merchant_id,
      merchantOrderId: o.merchant_order_id,
      authorizedAt: exec.completed_at,
      railRef: exec.rail_ref,
    },
    sources: await storedSources(db, snapshot),
    packs: ALL_PACKS,
    demo: false,
  };
}

/** Just the signed contract of a stored order, for a delivery match. */
export async function storedOrderContract(
  orderId: string,
  db: AdminDb = createAdminClient(),
): Promise<ContractBody | null> {
  if (!UUID.test(orderId)) return null;
  const { data } = await db
    .from("orders")
    .select("payment_executions!inner(contract_versions!inner(body))")
    .eq("id", orderId)
    .maybeSingle();
  const body = (
    data?.payment_executions as unknown as {
      contract_versions: { body: unknown } | null;
    } | null
  )?.contract_versions?.body;
  return (body as ContractBody | undefined) ?? null;
}

/* ------------------------------------------------------------ the pack */

const money = (r: OrderRecord) => (minor: number) =>
  formatMoneyText(minor, r.contract.economics.currency);

export function proofLine(report: ProofReport | null): string {
  if (!report) return "No proof report recorded";
  const h = report.summary.hard;
  return `${h.pass} of ${h.pass + h.unknown + h.fail} hard rules passed${h.unknown ? ` · ${h.unknown} can't check (waived)` : ""}`;
}

export async function buildOrderPack(
  r: OrderRecord,
  generatedAt: string,
): Promise<EvidencePack> {
  const m = money(r);
  const notes = r.demo ? DEMO_NOTES : [];
  const summaryPdf = await renderPackSummary({
    orderId: r.orderId,
    merchant: r.merchant,
    merchantOrderId: r.merchantOrderId,
    paidAt: r.payment.authorizedAt ? formatStamp(r.payment.authorizedAt) : null,
    total: m(r.payment.amountMinor),
    payment: `${r.payment.status.toUpperCase()} · ${r.payment.rail}`,
    contractVersion: r.contract.version,
    contractHash: r.contractHash,
    signedAt: r.signedAt ? formatStamp(r.signedAt) : null,
    signedWith: r.signature
      ? r.demo
        ? "Cartel demo key (Ed25519)"
        : `Passkey ${String(r.signature.publicKeyJwk.kty)} ${String(r.signature.publicKeyJwk.crv ?? "")} · ${r.signature.rp.origin}`
      : "No signature on record",
    items: r.contract.items.map((i) => ({
      title: i.title,
      sku: i.sku,
      gtin: i.gtin ?? null,
      qty: i.qty,
      amount: m(i.unitPriceMinor * i.qty),
    })),
    proof: proofLine(r.report),
    ledger: {
      events: r.ledger.length,
      head: r.ledger.at(-1)?.hash ?? "empty",
    },
    sources: r.sources.length,
    generatedAt,
    notes,
  });
  const { rp: _rp, ...assertion } = r.signature ?? { rp: null };
  return buildEvidencePack({
    orderId: r.orderId,
    generatedAt,
    contract: r.contract,
    signature: r.signature,
    proofReport: r.report ?? {},
    ap2: r.signature ? toAp2(r.contract, assertion as ContractSignature) : null,
    ledger: r.ledger,
    payment: r.payment,
    sources: r.sources,
    summaryPdf,
    verifyScript: VERIFY_MJS,
    notes,
  });
}

/** The flagship pack, stamped at its (demo) payment time so it is reproducible. */
export const flagshipPack = cache(async () => {
  const r = await flagshipOrderRecord();
  return buildOrderPack(r, r.payment.authorizedAt ?? r.contract.issuedAt);
});

export function packPath(userId: string, orderId: string) {
  return `${userId}/${orderId}.zip`;
}

/**
 * Builds, uploads and records a stored order's pack (TASKS T15.1). Safe to
 * repeat: the upload overwrites the object and each run adds a row and a
 * ledger `evidence_pack.generated` with that zip's sha256.
 */
export async function generateStoredPack(
  orderId: string,
  db: AdminDb = createAdminClient(),
): Promise<{ path: string; sha256: Hash } | null> {
  const r = await storedOrderRecord(orderId, db);
  if (!r?.userId) return null;
  const pack = await buildOrderPack(r, new Date().toISOString());
  const path = packPath(r.userId, r.orderId);
  const up = await db.storage
    .from(EVIDENCE_PACK_BUCKET)
    .upload(path, pack.zip, { contentType: "application/zip", upsert: true });
  if (up.error)
    throw new Error(`evidence pack upload failed: ${up.error.message}`);
  must(
    await db.rpc("srv_record_evidence_pack", {
      p_order: r.orderId,
      p_path: path,
      p_sha256: pack.sha256,
    }),
    "record evidence pack",
  );
  return { path, sha256: pack.sha256 };
}

/** The newest pack for an order, generating it when there is none yet. */
export async function ensureStoredPack(
  orderId: string,
  opts: { refresh?: boolean } = {},
  db: AdminDb = createAdminClient(),
): Promise<{ path: string; sha256: Hash } | null> {
  if (!opts.refresh) {
    const { data } = await db
      .from("evidence_packs")
      .select("storage_path,sha256")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return { path: data.storage_path, sha256: data.sha256 as Hash };
  }
  return generateStoredPack(orderId, db);
}

export const SIGNED_URL_TTL_S = 300;

export async function signedPackUrl(
  path: string,
  orderLabel: string,
  db: AdminDb = createAdminClient(),
): Promise<string> {
  const { data, error } = await db.storage
    .from(EVIDENCE_PACK_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_S, {
      download: `evidence-pack-${orderLabel}.zip`,
    });
  if (error || !data) throw new Error(`signed url failed: ${error?.message}`);
  return data.signedUrl;
}

/* ------------------------------------------------- delivery and dispute */

/** Delivery scans for this order, from the plan's ledger. */
export function deliveryScans(r: OrderRecord): DisputeScan[] {
  return r.ledger.flatMap((e) => {
    if (e.type !== "delivery.matched" && e.type !== "delivery.mismatched")
      return [];
    try {
      const p = JSON.parse(e.payloadText) as Record<string, unknown>;
      if (p.orderId !== r.orderId || typeof p.gtin !== "string") return [];
      return [
        {
          gtin: p.gtin,
          method: p.method === "scan" ? "scan" : "typed",
          at: e.createdAt.replace(/\.\d+Z$/, "Z"),
          ledgerSeq: e.seq,
        } satisfies DisputeScan,
      ];
    } catch {
      return [];
    }
  });
}

// The evidence badge's wording (components/cartel/evidence-badge.tsx).
const STATE_LABEL: Record<string, string> = {
  verified: "Confirmed",
  source_stated: "Source says",
  supported: "Evidence suggests",
  estimated: "Estimate",
  unknown: "Can't check",
};

/** The facts each approved item relied on, as they stood at purchase. */
export function factsAtPurchase(r: OrderRecord): ItemFacts[] {
  const snap = r.snapshot;
  if (!snap) return [];
  const sourceName = (id: string) =>
    snap.sources?.[id]?.name ?? (id === "checkout-snapshot" ? "Checkout" : id);
  return r.contract.items.map((item) => {
    const offer = snap.offers.find(
      (o) => o.sku === item.sku && o.merchant === item.merchant,
    );
    const subjects = new Set(offer ? [offer.id, offer.productId] : []);
    const facts = snap.facts
      .filter((f) => subjects.has(f.subjectId))
      .sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : 0))
      .map((f) => {
        const def = fieldDef(f.field, r.packs);
        return {
          label: def?.label ?? f.field,
          value: f.value === null ? "—" : formatValue(f.value, def),
          state: STATE_LABEL[f.state] ?? f.state,
          source: sourceName(f.sourceId),
          retrievedAt: f.retrievedAt,
        };
      });
    return { sku: item.sku, facts };
  });
}

export function disputePacket(
  r: OrderRecord,
  extraScans: readonly DisputeScan[] = [],
): DisputePacket {
  return buildDisputePacket({
    orderId: r.orderId,
    merchantOrderId: r.merchantOrderId,
    merchant: r.merchant,
    contract: r.contract,
    contractHash: r.contractHash,
    signedAt: r.signedAt,
    paidAt: r.payment.authorizedAt,
    totalMinor: r.payment.amountMinor,
    factsAtPurchase: factsAtPurchase(r),
    scans: [...deliveryScans(r), ...extraScans],
  });
}

export const orderMoney = money;
export const demoNotes = (r: OrderRecord) => (r.demo ? DEMO_NOTES : []);
