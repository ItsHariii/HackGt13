"use client";
import { useState } from "react";
import { Stamp } from "@/components/paper/stamp";
import { Button } from "@/components/ui/button";
import { signContractVersion, signingMessage } from "@/lib/signing-client";

type State =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "signed"; bodyHash: string }
  | { kind: "cancelled" }
  | { kind: "unsupported" }
  | { kind: "error"; code: string };

/**
 * "Sign with passkey" for one contract version (T12.4). The SIGNED stamp shows
 * only after the server verified the assertion; a cancelled ceremony says
 * plainly that nothing was signed and offers a phone.
 */
export function SignContract({
  contractVersionId,
  version,
  onSigned,
}: {
  contractVersionId: string;
  version: number;
  onSigned?: (result: { bodyHash: string }) => void;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  async function sign(usePhone: boolean) {
    setState({ kind: "signing" });
    const result = await signContractVersion(contractVersionId, usePhone);
    if (result.status === "ok") {
      setState({ kind: "signed", bodyHash: result.bodyHash });
      onSigned?.({ bodyHash: result.bodyHash });
    } else if (result.status === "error")
      setState({ kind: "error", code: result.code });
    else setState({ kind: result.status });
  }
  if (state.kind === "signed")
    return (
      <div role="status" aria-live="assertive" className="space-y-3">
        <Stamp tone="signed" size="lg">{`SIGNED v${version}`}</Stamp>
        <p className="text-muted">
          Contract v{version} signed.{" "}
          <span className="break-all font-mono text-xs">{state.bodyHash}</span>
        </p>
      </div>
    );
  const busy = state.kind === "signing";
  return (
    <div className="space-y-4">
      <div aria-live="polite">
        {state.kind === "cancelled" && (
          <div>
            <p className="font-semibold">
              Signing cancelled. Nothing was signed.
            </p>
            <p className="text-muted">
              Contract v{version} is unchanged and still unsigned.
            </p>
          </div>
        )}
        {state.kind === "unsupported" && (
          <p>
            This device can't use a passkey here. Nothing was signed. Use your
            phone to sign instead.
          </p>
        )}
        {state.kind === "error" && (
          <p className="text-[#9b2924]">{signingMessage(state.code)}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={busy} onClick={() => void sign(false)}>
          {busy
            ? "Waiting for your passkey…"
            : state.kind === "idle"
              ? "Sign with passkey"
              : "Try again"}
        </Button>
        {(state.kind === "cancelled" || state.kind === "unsupported") && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void sign(true)}
          >
            Use my phone
          </Button>
        )}
      </div>
    </div>
  );
}
