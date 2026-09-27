import "server-only";
import {
  Document,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ReactNode } from "react";

/*
 * Shared pieces for the Evidence Pack summary and the dispute packet
 * (TASKS T15.1, T15.4). Only the 14 standard PDF fonts are used, so
 * rendering never fetches anything; `pdfText` keeps text inside their
 * WinAnsi character set.
 */

const REPLACE: [RegExp, string][] = [
  [/≥/g, ">="],
  [/≤/g, "<="],
  [/→/g, "->"],
  [/←/g, "<-"],
  [/✓/g, "OK"],
  [/✗/g, "X"],
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
  [/−/g, "-"],
  [/ | /g, " "],
];

/** Text safe for the standard fonts: known symbols spelled out, the rest dropped. */
export function pdfText(value: string): string {
  let out = value;
  for (const [re, to] of REPLACE) out = out.replace(re, to);
  // WinAnsi covers Latin-1 plus a few typographic marks (… – — • € ™).
  return out.replace(/[^\x20-\x7e -ÿ…–—•€™]/g, "");
}

export const INK = "#1f2a44";
export const GRAPHITE = "#2b2b2b";
export const MUTED = "#6b6b6b";
export const RULE = "#d9d4c7";
export const RED = "#b3261e";
export const GREEN = "#2f6b3a";

export const s = StyleSheet.create({
  page: {
    paddingVertical: 40,
    paddingHorizontal: 44,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: GRAPHITE,
    backgroundColor: "#fbf9f4",
    lineHeight: 1.35,
  },
  eyebrow: {
    fontSize: 7.5,
    letterSpacing: 1.2,
    color: MUTED,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
  },
  title: {
    fontFamily: "Times-Bold",
    fontSize: 20,
    lineHeight: 1.15,
    marginTop: 4,
    marginBottom: 4,
    color: INK,
  },
  lead: { fontSize: 10, color: GRAPHITE },
  section: { marginTop: 12 },
  h2: {
    fontFamily: "Times-Bold",
    fontSize: 12.5,
    color: INK,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 0.75,
    borderBottomColor: RULE,
  },
  row: { flexDirection: "row", paddingVertical: 2 },
  rowRule: { borderBottomWidth: 0.5, borderBottomColor: RULE },
  key: { width: 118, color: MUTED },
  val: { flex: 1 },
  mono: { fontFamily: "Courier", fontSize: 8.5 },
  bold: { fontFamily: "Helvetica-Bold" },
  small: { fontSize: 8, color: MUTED },
  stamp: {
    alignSelf: "flex-start",
    borderWidth: 1.5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    letterSpacing: 1.5,
    marginTop: 10,
  },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 44,
    right: 44,
    fontSize: 7.5,
    color: MUTED,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export function KeyValue({
  k,
  children,
  mono,
}: {
  k: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <View style={[s.row, s.rowRule]} wrap={false}>
      <Text style={s.key}>{pdfText(k)}</Text>
      <Text style={mono ? [s.val, s.mono] : s.val}>
        {typeof children === "string" ? pdfText(children) : children}
      </Text>
    </View>
  );
}

export function Table({
  columns,
  rows,
}: {
  columns: { label: string; width: number | "flex"; mono?: boolean }[];
  rows: (string | { text: string; color?: string })[][];
}) {
  const cell = (i: number) => {
    const c = columns[i];
    return c?.width === "flex" ? { flex: 1 } : { width: c?.width ?? 60 };
  };
  return (
    <View>
      <View
        style={[
          s.row,
          { borderBottomWidth: 0.75, borderBottomColor: GRAPHITE },
        ]}
      >
        {columns.map((c, i) => (
          <Text key={c.label} style={[cell(i), s.eyebrow, { paddingRight: 6 }]}>
            {pdfText(c.label)}
          </Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: static rows rendered once.
          key={ri}
          style={[s.row, s.rowRule]}
          wrap={false}
        >
          {r.map((v, i) => {
            const text = typeof v === "string" ? v : v.text;
            const color = typeof v === "string" ? undefined : v.color;
            return (
              <Text
                // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional.
                key={i}
                style={[
                  cell(i),
                  { paddingRight: 6 },
                  ...(columns[i]?.mono ? [s.mono] : []),
                  ...(color ? [{ color }] : []),
                ]}
              >
                {pdfText(text)}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function Sheet({
  title,
  subject,
  createdAt,
  footer,
  children,
}: {
  title: string;
  subject: string;
  createdAt: string;
  footer: string;
  children: ReactNode;
}) {
  const at = new Date(createdAt);
  return (
    <Document
      title={pdfText(title)}
      subject={pdfText(subject)}
      author="Cartel"
      creator="Cartel"
      producer="Cartel"
      creationDate={at}
      modificationDate={at}
    >
      <Page size="LETTER" style={s.page}>
        {children}
        <View style={s.footer} fixed>
          <Text>{pdfText(footer)}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

export async function renderPdf(doc: ReactNode): Promise<Uint8Array> {
  const buf = await renderToBuffer(doc as Parameters<typeof renderToBuffer>[0]);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}
