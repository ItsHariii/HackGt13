import { Fingerprint, KeyRound } from "lucide-react";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { formatStamp } from "@/lib/contract-view";
import { createClient } from "@/lib/supabase/server";
import { removePasskey } from "./actions";

/** Reads the visitor's session and live data on every request. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Signing passkey" };

async function credentials() {
  const db = await createClient();
  if (!db) return { state: "unconfigured" as const, rows: [] };
  const { data: user } = await db.auth.getUser();
  if (!user.user) return { state: "no_session" as const, rows: [] };
  const { data } = await db
    .from("signing_credentials")
    .select("id,device_label,created_at,last_used_at")
    .order("created_at", { ascending: false });
  return { state: "ok" as const, rows: data ?? [] };
}

/** /settings/signing (TASKS T11.13): the passkey that signs contracts. */
export default async function SigningSettings() {
  const { state, rows } = await credentials();
  return (
    <main className="dot-grid min-h-[70vh] text-graphite">
      <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-2">
          <p className="font-semibold text-meta text-muted uppercase tracking-label">
            Settings
          </p>
          <h1 className="font-semibold font-serif text-h2 tracking-heading">
            Signing passkey
          </h1>
          <p className="text-body text-graphite-2">
            Your passkey signs one exact contract version. It never pays on its
            own, and a changed contract needs a new signature.
          </p>
        </div>
        {state !== "ok" ? (
          <p className="sheet p-5 text-ui">
            {state === "unconfigured"
              ? "Passkeys are stored in the Cartel database, which isn't connected here."
              : "Sign in to see your signing passkeys."}
          </p>
        ) : rows.length === 0 ? (
          <p className="sheet p-5 text-ui">
            No signing passkey registered yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((c) => (
              <li
                key={c.id}
                className="sheet flex flex-wrap items-center gap-4 p-4"
              >
                <KeyRound size={20} aria-hidden="true" />
                <div className="flex flex-1 flex-col">
                  <span className="font-semibold text-ui">
                    {c.device_label ?? "Passkey"}
                  </span>
                  <span className="text-muted text-small">
                    Added {formatStamp(c.created_at)}
                    {c.last_used_at
                      ? ` · last used ${formatStamp(c.last_used_at)}`
                      : " · never used"}
                  </span>
                </div>
                <form action={removePasskey}>
                  <input type="hidden" name="id" value={c.id} />
                  <Button type="submit" variant="outline">
                    Remove
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            disabled
            className="w-fit"
            aria-describedby="register-note"
          >
            <Fingerprint size={18} aria-hidden="true" /> Register a signing
            passkey
          </Button>
          <p id="register-note" className="text-muted text-small">
            Registration arrives with contract signing (TASKS T12.1).
          </p>
        </div>
      </div>
    </main>
  );
}
