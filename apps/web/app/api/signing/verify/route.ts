import {
  signingDeps,
  signingError,
  signingOrigin,
  signingResponse,
  signingUser,
} from "@/lib/signing";
import { SigningError, verifySigning } from "@/lib/signing-service";
import { isCredential } from "../credential";

/** T12.3: verify the assertion, then sign the version in one transaction. */
export async function POST(request: Request) {
  try {
    const origin = signingOrigin(request);
    const user = await signingUser();
    const body = await request.json().catch(() => null);
    if (!isCredential(body?.response))
      throw new SigningError("invalid_request", 400);
    return signingResponse(
      await verifySigning(signingDeps(origin), user.id, body.response),
    );
  } catch (error) {
    return signingError(error);
  }
}
