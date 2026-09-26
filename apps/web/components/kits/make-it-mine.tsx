"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const ERRORS: Record<string, string> = {
  authentication_required:
    "Your session hasn't started yet. Reload the page and try again.",
  catalog_not_configured:
    "Kits are copied into the Cartel database, which isn't connected here.",
  auth_not_configured:
    "Kits are copied into the Cartel database, which isn't connected here.",
  kit_changed:
    "This kit changed while you were looking. Reload to see the new version.",
  kit_offer_unavailable: "One of the kit's products isn't available right now.",
};

/** "Make it mine" (TASKS T11.18): forks the kit into a new plan of your own. */
export function MakeItMine({
  slug,
  demoPlan,
}: {
  slug: string;
  demoPlan: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fork = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/kits/${slug}/fork`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.planId) {
        router.push(`/plans/${body.planId}/requirements`);
        return;
      }
      setError(
        ERRORS[body.error] ??
          "The kit couldn't be copied. Nothing was bought. Try again.",
      );
    } catch {
      setError(
        "The connection was interrupted. Nothing was bought. Try again.",
      );
    }
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void fork()} disabled={busy}>
          {busy ? "Copying the kit…" : "Make it mine"}
        </Button>
        {demoPlan && (
          <Link
            href={`/plans/${demoPlan}/requirements`}
            className="text-ink text-ui underline underline-offset-4"
          >
            Or open the demo plan
          </Link>
        )}
      </div>
      <p role="alert" className="text-red-pen text-small">
        {error}
      </p>
    </div>
  );
}
