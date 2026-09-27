import {
  signingDeps,
  signingError,
  signingOrigin,
  signingResponse,
  signingUser,
} from "@/lib/signing";
import { registrationOptions } from "@/lib/signing-service";

/** T12.1: WebAuthn creation options for the signing passkey. */
export async function POST(request: Request) {
  try {
    const origin = signingOrigin(request);
    const user = await signingUser();
    return signingResponse({
      options: await registrationOptions(signingDeps(origin), user),
    });
  } catch (error) {
    return signingError(error);
  }
}
