import "server-only";
import { Text, View } from "@react-pdf/renderer";
import {
  GREEN,
  KeyValue,
  pdfText,
  renderPdf,
  Sheet,
  s,
  Table,
} from "./document";

export type PackSummary = {
  orderId: string;
  merchant: string;
  merchantOrderId: string;
  paidAt: string | null;
  total: string;
  payment: string;
  contractVersion: number;
  contractHash: string;
  signedAt: string | null;
  signedWith: string;
  items: {
    title: string;
    sku: string;
    gtin: string | null;
    qty: number;
    amount: string;
  }[];
  proof: string;
  ledger: { events: number; head: string };
  sources: number;
  generatedAt: string;
  notes: readonly string[];
};

/** summary.pdf: the one-page human reading of an Evidence Pack. */
export function renderPackSummary(p: PackSummary): Promise<Uint8Array> {
  return renderPdf(
    <Sheet
      title={`Evidence Pack · ${p.orderId}`}
      subject={`Contract v${p.contractVersion} · ${p.contractHash}`}
      createdAt={p.generatedAt}
      footer={`Cartel Evidence Pack · ${p.orderId} · re-verify with: node verify.mjs`}
    >
      <Text style={s.eyebrow}>
        {pdfText(`Evidence Pack · order ${p.orderId}`)}
      </Text>
      <Text style={s.title}>Paid. Exactly what was approved.</Text>
      <Text style={s.lead}>
        {pdfText(
          `Contract v${p.contractVersion} was signed with a passkey and re-checked against the live checkout before payment. This summary is a reading aid: the files next to it are the evidence, and verify.mjs re-checks them offline.`,
        )}
      </Text>
      <Text style={[s.stamp, { color: GREEN, borderColor: GREEN }]}>PAID</Text>
      {p.notes.map((n) => (
        <Text key={n} style={[s.small, { marginTop: 6 }]}>
          {pdfText(n)}
        </Text>
      ))}

      <View style={s.section}>
        <Text style={s.h2}>Approved items</Text>
        <Table
          columns={[
            { label: "Item", width: "flex" },
            { label: "SKU", width: 96, mono: true },
            { label: "GTIN", width: 96, mono: true },
            { label: "Qty", width: 30 },
            { label: "Amount", width: 62 },
          ]}
          rows={p.items.map((i) => [
            i.title,
            i.sku,
            i.gtin ?? "-",
            String(i.qty),
            i.amount,
          ])}
        />
      </View>

      <View style={s.section}>
        <Text style={s.h2}>Contract and signature</Text>
        <KeyValue k="Contract">{`v${p.contractVersion}`}</KeyValue>
        <KeyValue k="SHA-256 (JCS)" mono>
          {p.contractHash}
        </KeyValue>
        <KeyValue k="Signed">{p.signedAt ?? "Not signed"}</KeyValue>
        <KeyValue k="Signed with">{p.signedWith}</KeyValue>
        <KeyValue k="Proof">{p.proof}</KeyValue>
      </View>

      <View style={s.section}>
        <Text style={s.h2}>Payment</Text>
        <KeyValue k="Merchant">{p.merchant}</KeyValue>
        <KeyValue k="Merchant order">{p.merchantOrderId}</KeyValue>
        <KeyValue k="Total">{p.total}</KeyValue>
        <KeyValue k="Result">{p.payment}</KeyValue>
        <KeyValue k="Paid">{p.paidAt ?? "-"}</KeyValue>
      </View>

      <View style={s.section}>
        <Text style={s.h2}>What is in this pack</Text>
        <KeyValue k="Ledger">{`${p.ledger.events} hash-chained events`}</KeyValue>
        <KeyValue k="Ledger head" mono>
          {p.ledger.head}
        </KeyValue>
        <KeyValue k="Source snapshots">{String(p.sources)}</KeyValue>
        <KeyValue k="Generated">{p.generatedAt}</KeyValue>
      </View>

      <View style={s.section}>
        <Text style={s.h2}>Check it yourself</Text>
        <Text>
          Unzip the pack and run "node verify.mjs" (Node 20 or later). It needs
          no network. It re-computes the contract hash, verifies the passkey
          signature over it, re-hashes the ledger chain and every source
          snapshot, and prints one line per check.
        </Text>
        <Text style={[s.small, { marginTop: 6 }]}>
          This pack shows what was approved and what the evidence said at
          purchase. It does not promise fit, genuineness or delivery.
        </Text>
      </View>
    </Sheet>,
  );
}
