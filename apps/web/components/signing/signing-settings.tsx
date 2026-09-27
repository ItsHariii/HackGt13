"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { removePasskey } from "@/app/(site)/settings/signing/actions";
import { Button } from "@/components/ui/button";
import { registerSigningKey, signingMessage } from "@/lib/signing-client";

export type SigningKey = {
  id: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

/** Settings → Signing key (T12.1). Separate from the passkey used to sign in. */
export function SigningSettings({ keys }: { keys: SigningKey[] | null }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function register(usePhone: boolean) {
    setBusy(true);
    setMessage("Waiting for your passkey…");
    const result = await registerSigningKey(label.trim() || null, usePhone);
    setBusy(false);
    if (result.status === "ok") {
      setLabel("");
      setMessage("Signing key added.");
      router.refresh();
    } else if (result.status === "cancelled")
      setMessage("Cancelled. No signing key was added.");
    else if (result.status === "unsupported")
      setMessage(
        "This browser can't create a passkey. Try “Use my phone” or another browser.",
      );
    else setMessage(signingMessage(result.code));
  }
  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <p className="font-mono text-xs uppercase tracking-widest text-muted">
        Settings / Signing key
      </p>
      <h1 className="mt-4 font-serif text-5xl tracking-tight">
        One touch signs one exact contract.
      </h1>
      <p className="mt-5 max-w-xl text-muted">
        Your signing passkey signs the hash of a contract version, never a login
        challenge. Any change to the contract makes a new version that needs a
        new signature.
      </p>
      {keys === null ? (
        <p className="my-8 border-y border-border py-6 text-muted">
          Sign in to manage your signing keys.
        </p>
      ) : (
        <section
          aria-label="Signing keys"
          className="my-8 border-y border-border"
        >
          {keys.length === 0 && (
            <p className="py-6 text-muted">No signing key yet.</p>
          )}
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex flex-wrap justify-between gap-2 border-b border-border py-5 last:border-0"
            >
              <span>{key.label ?? "Signing passkey"}</span>
              <span className="flex items-center gap-4">
                <span className="font-mono text-sm">
                  {key.lastUsedAt
                    ? `last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                    : `added ${new Date(key.createdAt).toLocaleDateString()}`}
                </span>
                <form action={removePasskey}>
                  <input type="hidden" name="id" value={key.id} />
                  <button
                    type="submit"
                    aria-label={`Remove ${key.label ?? "signing passkey"}`}
                    className="min-h-6 text-ink text-sm underline underline-offset-4"
                  >
                    Remove
                  </button>
                </form>
              </span>
            </div>
          ))}
        </section>
      )}
      {keys !== null && (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void register(false);
          }}
        >
          <label className="block">
            Name this key (optional)
            <input
              value={label}
              maxLength={80}
              placeholder="MacBook Touch ID"
              onChange={(event) => setLabel(event.target.value)}
              className="mt-2 w-full rounded border border-border bg-white p-3 text-[#2b2a28] focus:outline-2 focus:outline-ink"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy}>
              Add signing key
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void register(true)}
            >
              Use my phone
            </Button>
          </div>
        </form>
      )}
      <p aria-live="polite" className="mt-6 min-h-6">
        {message}
      </p>
    </div>
  );
}
