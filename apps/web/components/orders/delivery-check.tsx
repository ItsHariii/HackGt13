"use client";
import { normalizeGtin } from "@cartel/evidence-pack/delivery";
import { Camera, CameraOff, ScanLine } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  type DeliveryCheck as Check,
  checkDelivery,
} from "@/app/(site)/orders/[id]/actions";
import { Stamp } from "@/components/paper/stamp";
import { Button } from "@/components/ui/button";

export type DeliveryItemView = {
  title: string;
  sku: string;
  gtin: string | null;
  qty: number;
};

export type PastScan = {
  gtin: string;
  matched: string | null;
  at: string;
  seq: number | null;
};

type Detector = {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
};
type DetectorCtor = {
  new (opts: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

const FORMATS = ["ean_13", "ean_8", "upc_a", "itf"];

/**
 * Delivery match (TASKS T15.3): scan the box barcode with the camera
 * (BarcodeDetector, or @zxing/browser where it's missing) or type the GTIN,
 * and compare it with the items in the signed contract.
 */
export function DeliveryCheck({
  orderId,
  items,
  scans,
  samples = [],
}: {
  orderId: string;
  items: DeliveryItemView[];
  scans: PastScan[];
  /** Demo-only shortcuts: "type this box's GTIN". */
  samples?: { label: string; gtin: string }[];
}) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<
    (Check & { method: "scan" | "typed" }) | null
  >(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const video = useRef<HTMLVideoElement>(null);
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => () => stop.current?.(), []);

  const submit = (value: string, method: "scan" | "typed") => {
    start(async () => {
      const r = await checkDelivery(orderId, value, method);
      setResult({ ...r, method });
    });
  };

  const stopScan = () => {
    stop.current?.();
    stop.current = null;
    setScanning(false);
  };

  const onScanned = (value: string) => {
    stopScan();
    setCode(value);
    submit(value, "scan");
  };

  const startScan = async () => {
    setCameraError(null);
    setResult(null);
    setScanning(true);
    const el = video.current;
    if (!el) return;
    try {
      const Native = (globalThis as { BarcodeDetector?: DetectorCtor })
        .BarcodeDetector;
      const supported = Native
        ? (await Native.getSupportedFormats()).filter((f) =>
            FORMATS.includes(f),
          )
        : [];
      if (Native && supported.length) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        el.srcObject = stream;
        await el.play();
        const detector = new Native({ formats: supported });
        let live = true;
        stop.current = () => {
          live = false;
          for (const t of stream.getTracks()) t.stop();
          el.srcObject = null;
        };
        const tick = async () => {
          if (!live) return;
          try {
            const [hit] = await detector.detect(el);
            if (hit?.rawValue && normalizeGtin(hit.rawValue))
              return onScanned(hit.rawValue);
          } catch {
            // A frame that isn't ready yet; try the next one.
          }
          setTimeout(tick, 200);
        };
        tick();
        return;
      }
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        el,
        (hit) => {
          const text = hit?.getText();
          if (text && normalizeGtin(text)) onScanned(text);
        },
      );
      stop.current = () => controls.stop();
    } catch (err) {
      stopScan();
      setCameraError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera access was blocked. Type the number under the barcode instead."
          : "No camera is available here. Type the number under the barcode instead.",
      );
    }
  };

  const title = (sku: string | null) =>
    items.find((i) => i.sku === sku)?.title ?? null;

  return (
    <section
      aria-labelledby="delivery-heading"
      className="sheet flex flex-col gap-4 p-5"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="delivery-heading"
          className="font-semibold font-serif text-h4 tracking-heading"
        >
          Check the delivery
        </h2>
        <p className="text-graphite-2 text-small">
          Scan the barcode on each box, or type the number under it. Cartel
          compares it with the items you signed for
          {items.some((i) => !i.gtin)
            ? ". Items without a GTIN in the contract can't be checked this way."
            : "."}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <video
          ref={video}
          muted
          playsInline
          aria-label="Camera preview for scanning a barcode"
          className={
            scanning
              ? "aspect-[4/3] w-full max-w-[420px] rounded-sm border border-rule bg-graphite object-cover"
              : "hidden"
          }
        />
        <div className="flex flex-wrap gap-3">
          {scanning ? (
            <Button type="button" variant="outline" onClick={stopScan}>
              <CameraOff size={16} aria-hidden="true" /> Stop camera
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={startScan}>
              <Camera size={16} aria-hidden="true" /> Scan a box
            </Button>
          )}
        </div>
        {cameraError && (
          <p role="alert" className="text-red-pen text-small">
            {cameraError}
          </p>
        )}
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) submit(code, "typed");
          }}
        >
          <label className="flex flex-col gap-1 text-small">
            <span className="text-muted">GTIN / UPC / EAN</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9 \-]{8,20}"
              maxLength={20}
              className="w-[220px] border border-rule bg-paper-raised px-3 py-2 font-mono text-ui"
            />
          </label>
          <Button type="submit" disabled={pending || !code.trim()}>
            <ScanLine size={16} aria-hidden="true" />
            {pending ? "Checking…" : "Check"}
          </Button>
        </form>
        {samples.length > 0 && (
          <p className="flex flex-wrap items-center gap-2 text-small">
            <span className="text-muted">Demo boxes:</span>
            {samples.map((s) => (
              <button
                key={s.gtin}
                type="button"
                className="border border-rule px-2 py-1 font-mono text-[12px] hover:border-ink"
                onClick={() => {
                  setCode(s.gtin);
                  submit(s.gtin, "typed");
                }}
              >
                {s.label} · {s.gtin}
              </button>
            ))}
          </p>
        )}
      </div>

      <div aria-live="polite" className="min-h-6">
        {result && !result.ok && (
          <p className="text-red-pen text-small">
            {result.error === "invalid_code"
              ? "That isn't a GTIN. Barcodes on boxes have 8, 12, 13 or 14 digits."
              : result.error === "not_found"
                ? "This order wasn't found."
                : "The check couldn't be saved right now. Try again."}
          </p>
        )}
        {result?.ok && result.result.outcome === "matched" && (
          <div className="flex flex-col gap-2">
            <Stamp tone="paid" size="sm">
              MATCHES
            </Stamp>
            <p className="text-small">
              {result.result.gtin} is{" "}
              <strong className="font-semibold">
                {result.result.item.title}
              </strong>
              , an item you approved.
              {result.ledgerSeq
                ? ` Recorded as ledger event #${result.ledgerSeq}.`
                : ""}
              {result.demo ? " (Demo order: not recorded.)" : ""}
            </p>
          </div>
        )}
        {result?.ok && result.result.outcome === "mismatched" && (
          <div className="flex flex-col gap-2 border-red-pen border-l-2 pl-4">
            <Stamp tone="blocked" size="sm">
              NOT WHAT YOU APPROVED
            </Stamp>
            <p className="text-small">
              {result.result.gtin} doesn't match any item in the contract
              {result.result.expected.length
                ? `. Expected one of: ${result.result.expected.map((i) => `${i.title} (${i.gtin})`).join("; ")}.`
                : "."}
              {result.result.checkDigitOk
                ? ""
                : " Its check digit is off, so it may have been mistyped."}
              {result.ledgerSeq
                ? ` Recorded as ledger event #${result.ledgerSeq}.`
                : ""}
            </p>
            <Link
              href={
                result.demo
                  ? `/orders/${orderId}/dispute?gtin=${result.result.gtin}&method=${result.method}`
                  : `/orders/${orderId}/dispute`
              }
              className="text-ink text-small underline underline-offset-4"
            >
              Open the dispute packet
            </Link>
          </div>
        )}
      </div>

      {scans.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold text-meta text-muted uppercase tracking-label">
            Scanned so far
          </h3>
          <ul className="flex flex-col gap-1 text-small">
            {scans.map((s) => (
              <li key={`${s.seq}-${s.gtin}`} className="flex gap-2">
                <span
                  aria-hidden="true"
                  className={s.matched ? "text-green-check" : "text-red-pen"}
                >
                  {s.matched ? "✓" : "✗"}
                </span>
                <span className="font-mono">{s.gtin}</span>
                <span>
                  {s.matched
                    ? (title(s.matched) ?? s.matched)
                    : "Not an approved item"}
                </span>
                <span className="text-muted">
                  {s.at}
                  {s.seq ? ` · #${s.seq}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
