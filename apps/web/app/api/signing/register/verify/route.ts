import {
  signingDeps,
  signingError,
  signingOrigin,
  signingResponse,
  signingUser,
} from "@/lib/signing";
import { SigningError, verifyRegistration } from "@/lib/signing-service";
import { isCredential } from "../../credential";

/** T12.1: verify the attestation and store the signing credential. */
export async function POST(request: Request) {
  try {
    const origin = signingOrigin(request);
    const user = await signingUser();
    const body = await request.json().catch(() => null);
    const label = body?.label ?? null;
    if (
      !isCredential(body?.response) ||
      (label !== null && (typeof label !== "string" || label.length > 80))
    )
      throw new SigningError("invalid_request", 400);
    const result = await verifyRegistration(
      signingDeps(origin),
      user.id,
      body.response,
      label?.trim() || null,
    );
    return signingResponse(result, 201);
  } catch (error) {
    return signingError(error);
  }
}
