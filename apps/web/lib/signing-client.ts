import {
  browserSupportsWebAuthn,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

/**
 * The browser half of the signing ceremony (T12.4). Every outcome is a value,
 * so screens can render "Nothing was signed." without inspecting exceptions.
 */
export type CeremonyResult<T> =
  | ({ status: "ok" } & T)
  | { status: "cancelled" }
  | { status: "unsupported" }
  | { status: "error"; code: string; expected?: string };

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ServerError(
      data.error ?? "signing_unavailable",
      typeof data.expected === "string" ? data.expected : undefined,
    );
  return data as T;
}
class ServerError extends Error {
  constructor(
    code: string,
    /** For `origin_rejected`: the address that can sign. */
    readonly expected?: string,
  ) {
    super(code);
  }
}

/** Cancelled, timed out, or no matching passkey: WebAuthn reports all as NotAllowedError. */
function outcome(error: unknown): CeremonyResult<never> {
  if (error instanceof ServerError)
    return {
      status: "error",
      code: error.message,
      ...(error.expected ? { expected: error.expected } : {}),
    };
  // WebAuthnError keeps the DOMException name of its cause.
  const name = (error as Error | undefined)?.name;
  if (name === "NotAllowedError" || name === "AbortError")
    return { status: "cancelled" };
  if (name === "NotSupportedError" || name === "SecurityError")
    return { status: "unsupported" };
  if (name === "InvalidStateError")
    return { status: "error", code: "credential_exists" };
  return { status: "error", code: "ceremony_failed" };
}

/** Prefer a phone over caBLE/hybrid, for "Use my phone" and devices without a platform passkey. */
function viaPhone<
  T extends
    | PublicKeyCredentialRequestOptionsJSON
    | PublicKeyCredentialCreationOptionsJSON,
>(options: T): T {
  return {
    ...options,
    hints: ["hybrid"],
    ...("allowCredentials" in options && options.allowCredentials
      ? {
          allowCredentials: options.allowCredentials.map((c) => ({
            ...c,
            transports: [
              ...new Set([...(c.transports ?? []), "hybrid" as const]),
            ],
          })),
        }
      : {}),
  };
}

export async function registerSigningKey(
  label: string | null,
  usePhone = false,
): Promise<CeremonyResult<{ credentialId: string }>> {
  if (!browserSupportsWebAuthn()) return { status: "unsupported" };
  try {
    const { options } = await post<{
      options: PublicKeyCredentialCreationOptionsJSON;
    }>("/api/signing/register/options", {});
    const response = await startRegistration({
      optionsJSON: usePhone ? viaPhone(options) : options,
    });
    const result = await post<{ credentialId: string }>(
      "/api/signing/register/verify",
      { response, label },
    );
    return { status: "ok", ...result };
  } catch (error) {
    return outcome(error);
  }
}

export async function signContractVersion(
  contractVersionId: string,
  usePhone = false,
): Promise<
  CeremonyResult<{
    signatureId: string;
    contractVersionId: string;
    bodyHash: string;
  }>
> {
  if (!browserSupportsWebAuthn()) return { status: "unsupported" };
  try {
    const { options } = await post<{
      options: PublicKeyCredentialRequestOptionsJSON;
    }>("/api/signing/options", { contractVersionId });
    const response = await startAuthentication({
      optionsJSON: usePhone ? viaPhone(options) : options,
    });
    const result = await post<{
      signatureId: string;
      contractVersionId: string;
      bodyHash: string;
    }>("/api/signing/verify", { response });
    return { status: "ok", ...result };
  } catch (error) {
    return outcome(error);
  }
}

const MESSAGES: Record<string, string> = {
  signing_key_required: "Add a signing key in Settings before you sign.",
  challenge_expired: "The signing request expired. Nothing was signed.",
  contract_expired: "This contract version expired. Review a fresh version.",
  contract_superseded: "A newer version of this contract exists.",
  contract_not_awaiting_signature:
    "This version is not waiting for a signature.",
  body_hash_mismatch: "The contract changed. Nothing was signed.",
  credential_exists: "This passkey is already a signing key.",
  authentication_required: "Sign in to continue.",
  signing_not_configured:
    "Passkey signing isn't set up on this deployment. Nothing was signed.",
  auth_not_configured:
    "Sign-in isn't set up on this deployment. Nothing was signed.",
  origin_rejected:
    "Passkeys only work on Cartel's own address. Nothing was signed.",
  signing_storage_failed:
    "The signature couldn't be saved. Nothing was signed. Try again.",
};
export function signingMessage(code: string, expected?: string) {
  if (code === "origin_rejected" && expected)
    return `Passkeys only work at ${new URL(expected).host}. Open Cartel there to sign. Nothing was signed.`;
  return MESSAGES[code] ?? "Signing failed. Nothing was signed.";
}
