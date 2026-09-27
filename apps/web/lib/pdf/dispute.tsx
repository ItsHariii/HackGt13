import "server-only";
import type { DisputePacket } from "@cartel/evidence-pack";
import { Text, View } from "@react-pdf/renderer";
import {
  GREEN,
  KeyValue,
  pdfText,
  RED,
  renderPdf,
  Sheet,
  s,
  Table,
} from "./document";

export type DisputeFormat = {
  money: (minor: number) => string;
  stamp: (iso: string) => string;
  generatedAt: string;
  notes: readonly string[];
};

/** The dispute packet as a PDF (TASKS T15.4): approved, facts at purchase, received. */
export function renderDisputePdf(
  d: DisputePacket,
  f: DisputeFormat,
): Promise<Uint8Array> {
  const mismatch = d.received.some((r) => !r.matched);
  const scanned = d.received.length > 0;
  return renderPdf(
    <Sheet
      title={`Dispute packet · ${d.orderId}`}
      subject={`${d.category} · contract v${d.approved.version}`}
      createdAt={f.generatedAt}
      footer={`Cartel dispute packet · order ${d.orderId} · contract ${d.approved.contractHash}`}
    >
      <Text style={s.eyebrow}>
        {pdfText(
          `Dispute packet · order ${d.orderId} · ${d.merchant} ${d.merchantOrderId}`,
        )}
      </Text>
      <Text style={s.title}>{pdfText(d.category)}</Text>
      <Text style={s.lead}>
        {pdfText(
          "What the customer approved and signed, what the evidence said at purchase, and what arrived. The merchant can read the same page as proof of exactly what was approved.",
        )}
      </Text>
      <Text
        style={[
          s.stamp,
          mismatch
            ? { color: RED, borderColor: RED }
            : scanned
              ? { color: GREEN, borderColor: GREEN }
              : {},
        ]}
      >
        {mismatch ? "MISMATCH" : scanned ? "MATCHES" : "NOT SCANNED YET"}
      </Text>
      {f.notes.map((n) => (
        <Text key={n} style={[s.small, { marginTop: 6 }]}>
          {pdfText(n)}
        </Text>
      ))}

      <View style={s.section}>
        <Text style={s.h2}>Findings</Text>
        {d.findings.map((line) => (
          <Text key={line} style={{ marginBottom: 3 }}>
            {pdfText(`• ${line}`)}
          </Text>
        ))}
      </View>

      <View style={s.section}>
        <Text style={s.h2}>1. Approved (signed)</Text>
        <KeyValue k="Contract">{`v${d.approved.version}`}</KeyValue>
        <KeyValue k="SHA-256 (JCS)" mono>
          {d.approved.contractHash}
        </KeyValue>
        <KeyValue k="Signed">
          {d.approved.signedAt ? f.stamp(d.approved.signedAt) : "Not signed"}
        </KeyValue>
        <KeyValue k="Paid">
          {d.approved.paidAt ? f.stamp(d.approved.paidAt) : "-"}
        </KeyValue>
        <KeyValue k="Total charged">{f.money(d.approved.totalMinor)}</KeyValue>
        <View style={{ marginTop: 8 }}>
          <Table
            columns={[
              { label: "Item", width: "flex" },
              { label: "SKU", width: 96, mono: true },
              { label: "GTIN", width: 96, mono: true },
              { label: "Qty", width: 28 },
              { label: "Unit price", width: 62 },
            ]}
            rows={d.approved.items.map((i) => [
              i.title,
              i.sku,
              i.gtin ?? "-",
              String(i.qty),
              f.money(i.unitPriceMinor),
            ])}
          />
        </View>
      </View>

      <View style={s.section}>
        <Text style={s.h2}>2. Facts at purchase (snapshots)</Text>
        {d.factsAtPurchase.length === 0 ? (
          <Text style={s.small}>No fact snapshots were recorded.</Text>
        ) : (
          d.factsAtPurchase.map((item) => (
            <View key={item.sku} style={{ marginBottom: 8 }}>
              <Text style={[s.bold, { marginBottom: 2 }]}>
                {pdfText(item.title)}
              </Text>
              <Table
                columns={[
                  { label: "Fact", width: 130 },
                  { label: "Value", width: "flex" },
                  { label: "Evidence", width: 64 },
                  { label: "Source", width: 110 },
                ]}
                rows={item.facts.map((r) => [
                  r.label,
                  r.value,
                  r.state,
                  r.retrievedAt
                    ? `${r.source} · ${f.stamp(r.retrievedAt)}`
                    : r.source,
                ])}
              />
            </View>
          ))
        )}
      </View>

      <View style={s.section}>
        <Text style={s.h2}>3. Received (scans)</Text>
        {d.received.length === 0 ? (
          <Text style={s.small}>Nothing has been scanned yet.</Text>
        ) : (
          <Table
            columns={[
              { label: "GTIN", width: 100, mono: true },
              { label: "How", width: 44 },
              { label: "When", width: 96 },
              { label: "Matches", width: "flex" },
              { label: "Ledger", width: 40 },
            ]}
            rows={d.received.map((r) => [
              r.gtin,
              r.method,
              f.stamp(r.at),
              r.matched
                ? { text: r.matched.title, color: GREEN }
                : { text: "No approved item", color: RED },
              r.ledgerSeq ? `#${r.ledgerSeq}` : "-",
            ])}
          />
        )}
      </View>
    </Sheet>,
  );
}
