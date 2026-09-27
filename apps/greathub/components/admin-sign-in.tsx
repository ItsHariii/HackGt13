"use client";
import { useActionState } from "react";
import { signIn } from "@/app/chaos/actions";
import { Lock } from "@/components/gh/icons";

export function AdminSignIn({ next }: { next: "/chaos" | "/orders" }) {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="gh-card gh-signin">
      <p className="gh-signin-title">
        <Lock size={18} /> Captain&apos;s quarters · admin only
      </p>
      <input type="hidden" name="next" value={next} />
      <label htmlFor="token">Admin token</label>
      <div className="gh-signin-row">
        <input
          id="token"
          name="token"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? "token-error" : undefined}
        />
        <button type="submit" className="gh-btn gh-btn-navy" disabled={pending}>
          {pending ? "Checking…" : "Come aboard"}
        </button>
      </div>
      {state?.error ? (
        <p id="token-error" className="gh-form-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
