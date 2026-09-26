"use client";
import { X } from "lucide-react";
import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/browser";

type Step =
  | { name: "choose"; error?: string }
  | { name: "code"; email: string; error?: string }
  | { name: "done"; email?: string };

type Upgrade = { open: (reason?: string) => void };
const NO_SESSION =
  "Cartel couldn't start your session. Check your connection and reload the page.";

const UpgradeContext = createContext<Upgrade>({ open: () => {} });

/** Opens the "save & pay" dialog from anywhere, e.g. before signing a contract. */
export const useUpgrade = () => useContext(UpgradeContext);

/** Supabase error codes worth explaining in plain words. */
function explain(code: string | undefined, fallback: string): string {
  switch (code) {
    case "email_exists":
      return "That email already has a Cartel account. Plans from this session can't be merged into it yet; use another email for now.";
    case "otp_expired":
      return "That code has expired or is wrong. Ask for a new one.";
    case "over_email_send_rate_limit":
      return "Too many emails were sent. Wait a minute, then try again.";
    case "provider_disabled":
    case "validation_failed":
      return "Google sign-in isn't set up here yet. Use email instead.";
    default:
      return fallback;
  }
}

/**
 * The first visit is an anonymous session (SessionProvider). Saving plans
 * and paying need a real identity, so this dialog links one to the same
 * user: an emailed 6-digit code (Supabase email change → verifyOtp) or
 * Google (linkIdentity). The user id stays the same, so plans are kept
 * (TASKS T10.5).
 */
export function UpgradeProvider({ children }: { children: ReactNode }) {
  const { user, status } = useSession();
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<string | undefined>();
  const [step, setStep] = useState<Step>({ name: "choose" });
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const emailId = useId();
  const codeId = useId();

  const open = useCallback(
    (why?: string) => {
      setReason(why);
      setStep(
        user && !user.is_anonymous
          ? { name: "done", ...(user.email ? { email: user.email } : {}) }
          : { name: "choose" },
      );
      dialog.current?.showModal();
    },
    [user],
  );
  const value = useMemo(() => ({ open }), [open]);

  const sendCode = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(
      new FormData(e.currentTarget).get("email") ?? "",
    ).trim();
    const client = createClient();
    if (!client) return;
    if (status !== "ready") {
      setStep({ name: "choose", error: NO_SESSION });
      return;
    }
    setBusy(true);
    const { error } = await client.auth.updateUser({ email });
    setBusy(false);
    if (error)
      setStep({ name: "choose", error: explain(error.code, error.message) });
    else setStep({ name: "code", email });
  };

  const verify = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (step.name !== "code") return;
    const token = String(
      new FormData(e.currentTarget).get("code") ?? "",
    ).replace(/\s/g, "");
    const client = createClient();
    if (!client) return;
    if (status !== "ready") {
      setStep({ name: "choose", error: NO_SESSION });
      return;
    }
    setBusy(true);
    const { error } = await client.auth.verifyOtp({
      email: step.email,
      token,
      type: "email_change",
    });
    setBusy(false);
    if (error) setStep({ ...step, error: explain(error.code, error.message) });
    else setStep({ name: "done", email: step.email });
  };

  const google = async () => {
    const client = createClient();
    if (!client) return;
    if (status !== "ready") {
      setStep({ name: "choose", error: NO_SESSION });
      return;
    }
    setBusy(true);
    const { error } = await client.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
    setBusy(false);
    if (error)
      setStep({ name: "choose", error: explain(error.code, error.message) });
  };

  const input =
    "h-11 w-full rounded-card border border-graphite bg-paper-sheet px-3 text-[16px] text-graphite";

  return (
    <UpgradeContext.Provider value={value}>
      {children}
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="m-auto w-[min(440px,calc(100vw-32px))] rounded-card border border-graphite bg-paper-raised p-0 text-graphite shadow-page backdrop:bg-graphite/40"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <h2 id={titleId} className="font-serif text-h4">
            {step.name === "done" ? "Your plans are saved" : "Save your plans"}
          </h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close"
            className="-mt-1 -mr-2 inline-flex size-10 items-center justify-center rounded-card hover:bg-paper"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-6 pt-2 pb-6">
          {status === "unconfigured" ? (
            <p className="text-muted text-small">
              Sign-in isn't configured in this environment.
            </p>
          ) : step.name === "choose" ? (
            <>
              <p className="text-small">
                {reason ?? "You're using Cartel without an account."} Add an
                email or Google to keep this session's plans and to sign and
                pay. Nothing you've done so far is lost.
              </p>
              <form onSubmit={sendCode} className="flex flex-col gap-2">
                <label htmlFor={emailId} className="font-semibold text-small">
                  Email
                </label>
                <input
                  id={emailId}
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  aria-describedby={step.error ? `${emailId}-error` : undefined}
                  className={input}
                />
                <Button type="submit" disabled={busy}>
                  Email me a code
                </Button>
              </form>
              <div className="flex items-center gap-3 text-muted text-small">
                <span className="h-px flex-1 bg-rule" /> or{" "}
                <span className="h-px flex-1 bg-rule" />
              </div>
              <Button variant="outline" onClick={google} disabled={busy}>
                Continue with Google
              </Button>
            </>
          ) : step.name === "code" ? (
            <form onSubmit={verify} className="flex flex-col gap-2">
              <p className="text-small">
                We sent a 6-digit code to <strong>{step.email}</strong>.
              </p>
              <label htmlFor={codeId} className="font-semibold text-small">
                Code
              </label>
              <input
                id={codeId}
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                required
                aria-describedby={step.error ? `${emailId}-error` : undefined}
                className={`${input} num tracking-[0.3em]`}
              />
              <Button type="submit" disabled={busy}>
                Save my plans
              </Button>
              <Button
                type="button"
                variant="link"
                className="self-start"
                onClick={() => setStep({ name: "choose" })}
              >
                Use a different email
              </Button>
            </form>
          ) : (
            <p className="text-small">
              {step.email ? `Signed in as ${step.email}. ` : ""}Plans from this
              session stay with your account.
            </p>
          )}
          <p
            id={`${emailId}-error`}
            role="alert"
            className="text-red-pen text-small empty:hidden"
          >
            {step.name !== "done" && step.error ? step.error : ""}
          </p>
        </div>
      </dialog>
    </UpgradeContext.Provider>
  );
}

/** The nav's account control: "Sign in" while anonymous, the email after. */
export function AccountButton() {
  const { user, status } = useSession();
  const { open } = useUpgrade();
  if (status === "unconfigured") return null;
  const saved = user && !user.is_anonymous;
  return (
    <button
      type="button"
      onClick={() => open()}
      className="inline-flex min-h-6 max-w-[22ch] items-center truncate text-graphite underline-offset-4 hover:underline"
    >
      {saved ? (user.email ?? "Account") : "Sign in"}
    </button>
  );
}
