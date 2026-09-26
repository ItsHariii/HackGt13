"use client";
import { KeyRound } from "lucide-react";
import { useActionState } from "react";
import { signIn } from "@/app/chaos/actions";

export function AdminSignIn({ next }: { next: "/chaos" | "/orders" }) {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="signin">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="token">Admin token</label>
      <div>
        <input
          id="token"
          name="token"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? "token-error" : undefined}
        />
        <button type="submit" className="primary-link" disabled={pending}>
          <KeyRound size={14} aria-hidden="true" />{" "}
          {pending ? "Checking…" : "Sign in"}
        </button>
      </div>
      {state?.error ? (
        <p id="token-error" className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
